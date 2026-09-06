import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const cloudSupabase = createClient(supabaseUrl, supabaseKey)

const DB_NAME = 'kyvo-offline'
const DB_VERSION = 1
const RECORDS = 'records'
const QUEUE = 'syncQueue'

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(RECORDS)) {
        const store = db.createObjectStore(RECORDS, { keyPath: 'key' })
        store.createIndex('table', 'table')
      }
      if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: 'queueId', autoIncrement: true })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function tx(storeName, mode, work) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const store = transaction.objectStore(storeName)
    let result
    try { result = work(store) } catch (error) { reject(error); return }
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

const key = (table, id) => `${table}:${id}`

async function put(table, row, userId = row?.user_id || row?.id) {
  if (!row?.id) return
  await tx(RECORDS, 'readwrite', (store) => store.put({ key: key(table, row.id), table, userId, row }))
}

async function putMany(table, rows, userId) {
  if (!rows?.length) return
  await tx(RECORDS, 'readwrite', (store) => {
    rows.forEach((row) => row?.id && store.put({ key: key(table, row.id), table, userId: userId || row.user_id || row.id, row }))
  })
}

async function getTable(table, userId) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(RECORDS, 'readonly').objectStore(RECORDS).index('table').getAll(table)
    request.onsuccess = () => {
      let rows = request.result.map((item) => item.row)
      if (userId && table !== 'users') rows = rows.filter((row) => row.user_id === userId)
      if (userId && table === 'users') rows = rows.filter((row) => row.id === userId || row.user_id === userId)
      resolve(rows)
    }
    request.onerror = () => reject(request.error)
  })
}

async function del(table, id) {
  await tx(RECORDS, 'readwrite', (store) => store.delete(key(table, id)))
}

async function enqueue(item) {
  await tx(QUEUE, 'readwrite', (store) => store.add({ ...item, createdAt: Date.now() }))
}

async function getQueue() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(QUEUE, 'readonly').objectStore(QUEUE).getAll()
    request.onsuccess = () => resolve(request.result.sort((a, b) => a.queueId - b.queueId))
    request.onerror = () => reject(request.error)
  })
}

async function removeQueue(id) {
  await tx(QUEUE, 'readwrite', (store) => store.delete(id))
}

async function cache(table, rows) {
  const normalized = table === 'tasks' ? (rows || []).map((row) => ({ ...row, subtasks: row.subtasks || [] })) : (rows || [])
  if (table === 'users') {
    const existing = await getTable('users')
    await putMany('users', normalized.map((row) => ({ ...(existing.find((item) => item.id === row.id) || {}), ...row })))
  } else {
    await putMany(table, normalized)
  }
  if (table === 'tasks') {
    for (const task of normalized) await putMany('subtasks', task.subtasks || [], task.user_id)
  }
}

async function localRows(table, userId) {
  if (table !== 'subtasks') return getTable(table, userId)
  const tasks = await getTable('tasks', userId)
  return tasks.flatMap((task) => (task.subtasks || []).map((subtask) => ({ ...subtask, user_id: task.user_id })))
}

const matches = (row, filters) => filters.every(({ column, value }) => row?.[column] === value)

function sortRows(rows, ordering, limitValue) {
  const result = [...rows]
  for (let i = ordering.length - 1; i >= 0; i -= 1) {
    const { column, ascending } = ordering[i]
    result.sort((a, b) => {
      const av = a?.[column], bv = b?.[column]
      if (av === bv) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return (av < bv ? -1 : 1) * (ascending ? 1 : -1)
    })
  }
  return limitValue == null ? result : result.slice(0, limitValue)
}

async function localSelect(table, userId, filters, ordering, limitValue, withSubtasks) {
  let rows = await localRows(table, userId)
  rows = sortRows(rows.filter((row) => matches(row, filters)), ordering, limitValue)
  if (table === 'tasks' && withSubtasks) {
    const subtasks = await localRows('subtasks', userId)
    rows = rows.map((task) => ({ ...task, subtasks: subtasks.filter((subtask) => subtask.task_id === task.id) }))
  }
  return rows
}

const networkError = (error) => {
  const message = String(error?.message || '').toLowerCase()
  return !navigator.onLine || message.includes('fetch') || message.includes('network') || message.includes('failed to fetch')
}

function cloudPayload(table, payload) {
  if (table === 'tasks' && payload) {
    const { subtasks, ...task } = payload
    return task
  }
  if (table === 'subtasks' && payload) {
    const { user_id, ...subtask } = payload
    return subtask
  }
  return payload
}

async function localMutation(table, action, payload, userId) {
  if (action === 'delete') {
    const existing = (await getTable(table, userId)).find((row) => row.id === payload.id)
    await del(table, payload.id)
    if (table === 'tasks') for (const subtask of existing?.subtasks || []) await del('subtasks', subtask.id)
    return null
  }

  const row = { ...payload, id: payload.id || crypto.randomUUID() }
  if (table === 'subtasks') {
    const tasks = await getTable('tasks', userId)
    const parent = tasks.find((task) => task.id === row.task_id)
    if (parent) {
      parent.subtasks = [...(parent.subtasks || []).filter((subtask) => subtask.id !== row.id), { ...row }]
      await put('tasks', parent, parent.user_id)
    }
  }
  await put(table, row, row.user_id || userId)
  return row
}

async function syncQueue() {
  if (!navigator.onLine) return
  const { data: { session } = {} } = await cloudSupabase.auth.getSession()
  if (!session) return

  const queue = await getQueue()
  for (const item of queue) {
    if (item.userId && item.userId !== session.user.id) continue
    try {
      let response
      if (item.action === 'delete') {
        response = await cloudSupabase.from(item.table).delete().eq('id', item.payload.id)
      } else if (item.action === 'update') {
        response = await cloudSupabase.from(item.table).update(cloudPayload(item.table, item.payload)).eq('id', item.payload.id)
      } else {
        response = await cloudSupabase.from(item.table).upsert(cloudPayload(item.table, item.payload), { onConflict: 'id' })
      }
      if (response.error) throw response.error
      await removeQueue(item.queueId)
    } catch (error) {
      if (networkError(error)) break
      console.warn('KYVO sync waiting:', error)
      break
    }
  }
}

class OfflineQuery {
  constructor(table) {
    this.table = table
    this.operation = 'select'
    this.columns = '*'
    this.filters = []
    this.ordering = []
    this.limitValue = null
    this.payload = null
    this.singleResult = false
  }
  select(columns = '*') { this.columns = columns; return this }
  eq(column, value) { this.filters.push({ column, value }); return this }
  order(column, options = {}) { this.ordering.push({ column, ascending: options.ascending !== false }); return this }
  limit(value) { this.limitValue = value; return this }
  single() { this.singleResult = true; return this }
  maybeSingle() { this.singleResult = true; return this }
  insert(payload) { this.operation = 'insert'; this.payload = payload; return this }
  update(payload) { this.operation = 'update'; this.payload = payload; return this }
  delete() { this.operation = 'delete'; return this }
  then(resolve, reject) { return this.execute().then(resolve, reject) }
  catch(reject) { return this.execute().catch(reject) }

  async execute() {
    const online = navigator.onLine
    if (this.operation === 'select') {
      if (online) {
        try {
          let query = cloudSupabase.from(this.table).select(this.columns)
          this.filters.forEach((filter) => { query = query.eq(filter.column, filter.value) })
          this.ordering.forEach((order) => { query = query.order(order.column, { ascending: order.ascending }) })
          if (this.limitValue != null) query = query.limit(this.limitValue)
          if (this.singleResult) query = query.maybeSingle()
          const result = await query
          if (!result.error) await cache(this.table, Array.isArray(result.data) ? result.data : (result.data ? [result.data] : []))
          return result
        } catch (error) {
          if (!networkError(error)) return { data: null, error }
        }
      }

      const userId = this.filters.find((filter) => filter.column === 'user_id')?.value
        || this.filters.find((filter) => filter.column === 'id')?.value
        || null
      const rows = await localSelect(this.table, userId, this.filters, this.ordering, this.limitValue, this.columns.includes('subtasks'))
      if (this.singleResult) {
        if (rows.length === 0) return { data: null, error: null }
        if (rows.length !== 1) return { data: null, error: new Error('Multiple rows found') }
        return { data: rows[0], error: null }
      }
      return { data: rows, error: null }
    }

    const userId = this.filters.find((filter) => filter.column === 'user_id')?.value

    if (this.operation === 'insert') {
      const payloads = Array.isArray(this.payload) ? this.payload : [this.payload]
      const rows = payloads.map((payload) => ({ ...payload, id: payload.id || crypto.randomUUID() }))
      if (!online) {
        for (const row of rows) {
          await localMutation(this.table, 'insert', row, userId || row.user_id)
          await enqueue({ userId: userId || row.user_id, table: this.table, action: 'upsert', payload: row })
        }
        return { data: this.singleResult ? rows[0] : rows, error: null }
      }
      try {
        let query = cloudSupabase.from(this.table).insert(this.payload).select(this.columns)
        if (this.singleResult) query = query.single()
        const result = await query
        if (result.error) throw result.error
        await cache(this.table, Array.isArray(result.data) ? result.data : (result.data ? [result.data] : []))
        return result
      } catch (error) {
        if (!networkError(error)) return { data: null, error }
        for (const row of rows) {
          await localMutation(this.table, 'insert', row, userId || row.user_id)
          await enqueue({ userId: userId || row.user_id, table: this.table, action: 'upsert', payload: row })
        }
        return { data: this.singleResult ? rows[0] : rows, error: null }
      }
    }

    const matched = await localSelect(this.table, userId, this.filters, [], null, true)
    if (!online) {
      if (this.operation === 'update') {
        const updated = []
        for (const row of matched) {
          const next = { ...row, ...this.payload }
          await localMutation(this.table, 'update', next, userId || row.user_id)
          await enqueue({ userId: userId || row.user_id, table: this.table, action: 'update', payload: next })
          updated.push(next)
        }
        return { data: this.singleResult ? (updated[0] || null) : updated, error: null }
      }
      for (const row of matched) {
        await localMutation(this.table, 'delete', { id: row.id }, userId || row.user_id)
        await enqueue({ userId: userId || row.user_id, table: this.table, action: 'delete', payload: { id: row.id } })
      }
      return { data: null, error: null }
    }

    try {
      let query = this.operation === 'update'
        ? cloudSupabase.from(this.table).update(this.payload)
        : cloudSupabase.from(this.table).delete()
      this.filters.forEach((filter) => { query = query.eq(filter.column, filter.value) })
      if (this.operation === 'update' && this.columns !== '*') {
        query = query.select(this.columns)
        if (this.singleResult) query = query.single()
      }
      const result = await query
      if (result.error) throw result.error

      if (this.operation === 'update') {
        const updatedRows = matched.map((row) => ({ ...row, ...this.payload }))
        for (const row of updatedRows) await localMutation(this.table, 'update', row, userId || row.user_id)
      } else {
        for (const row of matched) await localMutation(this.table, 'delete', { id: row.id }, userId || row.user_id)
      }
      if (result.data) await cache(this.table, Array.isArray(result.data) ? result.data : [result.data])
      return result
    } catch (error) {
      if (!networkError(error)) return { data: null, error }
      if (this.operation === 'update') {
        const updated = []
        for (const row of matched) {
          const next = { ...row, ...this.payload }
          await localMutation(this.table, 'update', next, userId || row.user_id)
          await enqueue({ userId: userId || row.user_id, table: this.table, action: 'update', payload: next })
          updated.push(next)
        }
        return { data: this.singleResult ? (updated[0] || null) : updated, error: null }
      }
      for (const row of matched) {
        await localMutation(this.table, 'delete', { id: row.id }, userId || row.user_id)
        await enqueue({ userId: userId || row.user_id, table: this.table, action: 'delete', payload: { id: row.id } })
      }
      return { data: null, error: null }
    }
  }
}

export const supabase = {
  from: (table) => new OfflineQuery(table),
  auth: cloudSupabase.auth,
  sync: syncQueue,
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => syncQueue().catch(() => {}))
  syncQueue().catch(() => {})
}
