import { supabase } from './supabaseClient'

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
      if (!db.objectStoreNames.contains(QUEUE)) {
        db.createObjectStore(QUEUE, { keyPath: 'queueId', autoIncrement: true })
      }
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

const recordKey = (table, id) => `${table}:${id}`

async function putRecord(table, row, userId = row?.user_id || row?.id) {
  if (!row?.id) return
  await tx(RECORDS, 'readwrite', (store) => store.put({
    key: recordKey(table, row.id), table, userId, row,
  }))
}

async function putMany(table, rows, userId) {
  if (!rows?.length) return
  await tx(RECORDS, 'readwrite', (store) => {
    rows.forEach((row) => {
      if (row?.id) store.put({
        key: recordKey(table, row.id),
        table,
        userId: userId || row.user_id || row.id,
        row,
      })
    })
  })
}

async function deleteRecord(table, id) {
  await tx(RECORDS, 'readwrite', (store) => store.delete(recordKey(table, id)))
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

async function removeQueue(queueId) {
  await tx(QUEUE, 'readwrite', (store) => store.delete(queueId))
}

async function cacheQuery(table, rows) {
  const normalized = table === 'tasks'
    ? (rows || []).map((row) => ({ ...row, subtasks: row.subtasks || [] }))
    : (rows || [])

  await putMany(table, normalized)

  if (table === 'tasks') {
    for (const task of normalized) {
      await putMany('subtasks', task.subtasks || [], task.user_id)
    }
  }
}

async function localRows(table, userId) {
  if (table === 'subtasks') {
    const tasks = await getTable('tasks', userId)
    return tasks.flatMap((task) => (task.subtasks || []).map((subtask) => ({
      ...subtask,
      user_id: task.user_id,
    })))
  }
  return getTable(table, userId)
}

function matches(row, filters) {
  return filters.every(({ column, value }) => row?.[column] === value)
}

function applyOrderLimit(rows, ordering, limitValue) {
  let result = [...rows]
  for (let i = ordering.length - 1; i >= 0; i -= 1) {
    const { column, ascending } = ordering[i]
    result.sort((a, b) => {
      const av = a?.[column]
      const bv = b?.[column]
      if (av === bv) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const comparison = av < bv ? -1 : 1
      return ascending ? comparison : -comparison
    })
  }
  return limitValue == null ? result : result.slice(0, limitValue)
}

async function localSelect(table, userId, filters, ordering, limitValue, wantSubtasks) {
  let rows = await localRows(table, userId)
  rows = rows.filter((row) => matches(row, filters))
  rows = applyOrderLimit(rows, ordering, limitValue)

  if (table === 'tasks' && wantSubtasks) {
    const subtasks = await localRows('subtasks', userId)
    rows = rows.map((task) => ({
      ...task,
      subtasks: subtasks.filter((subtask) => subtask.task_id === task.id),
    }))
  }

  return rows
}

function isNetworkError(error) {
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

async function applyLocalMutation(table, action, payload, userId) {
  if (action === 'insert' || action === 'upsert' || action === 'update') {
    const row = { ...payload, id: payload.id || crypto.randomUUID() }

    if (table === 'subtasks') {
      const tasks = await getTable('tasks', userId)
      const parent = tasks.find((task) => task.id === row.task_id)
      if (parent) {
        parent.subtasks = [
          ...(parent.subtasks || []).filter((subtask) => subtask.id !== row.id),
          { ...row },
        ]
        await putRecord('tasks', parent, parent.user_id)
      }
      await putRecord('subtasks', row, userId)
    } else {
      await putRecord(table, row, row.user_id || userId)
    }

    return row
  }

  if (action === 'delete') {
    const existing = (await getTable(table, userId)).find((row) => row.id === payload.id)
    await deleteRecord(table, payload.id)
    if (table === 'tasks') {
      for (const subtask of existing?.subtasks || []) await deleteRecord('subtasks', subtask.id)
    }
    return null
  }

  return null
}

async function syncQueue() {
  if (!navigator.onLine) return

  const queue = await getQueue()
  for (const item of queue) {
    try {
      if (item.action === 'delete') {
        const { error } = await supabase.from(item.table).delete().eq('id', item.payload.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from(item.table)
          .upsert(cloudPayload(item.table, item.payload), { onConflict: 'id' })
        if (error) throw error
      }
      await removeQueue(item.queueId)
    } catch (error) {
      if (isNetworkError(error)) break
      console.warn('KYVO sync waiting:', error)
      break
    }
  }
}

export function startOfflineSync() {
  const run = () => syncQueue().catch(() => {})
  window.addEventListener('online', run)
  run()
  return () => window.removeEventListener('online', run)
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
  order(column, options = {}) {
    this.ordering.push({ column, ascending: options.ascending !== false })
    return this
  }
  limit(value) { this.limitValue = value; return this }
  single() { this.singleResult = true; return this }
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
          const builder = supabase.from(this.table).select(this.columns)
          this.filters.forEach((filter) => builder.eq(filter.column, filter.value))
          this.ordering.forEach((order) => builder.order(order.column, { ascending: order.ascending }))
          if (this.limitValue != null) builder.limit(this.limitValue)
          if (this.singleResult) builder.single()
          const result = await builder
          if (!result.error) {
            const rows = Array.isArray(result.data) ? result.data : (result.data ? [result.data] : [])
            await cacheQuery(this.table, rows)
          }
          return result
        } catch (error) {
          if (!isNetworkError(error)) return { data: null, error }
        }
      }

      const userId = this.filters.find((filter) => filter.column === 'user_id')?.value
        || this.filters.find((filter) => filter.column === 'id')?.value
        || null
      const rows = await localSelect(
        this.table,
        userId,
        this.filters,
        this.ordering,
        this.limitValue,
        this.columns.includes('subtasks'),
      )

      if (this.singleResult) {
        if (rows.length !== 1) {
          return {
            data: null,
            error: new Error(rows.length === 0 ? 'No rows found' : 'Multiple rows found'),
          }
        }
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
          await applyLocalMutation(this.table, 'insert', row, userId || row.user_id)
          await enqueue({ userId: userId || row.user_id, table: this.table, action: 'upsert', payload: row })
        }
        return { data: this.singleResult ? rows[0] : rows, error: null }
      }

      try {
        let builder = supabase.from(this.table).insert(this.payload)
        builder = builder.select(this.columns)
        if (this.singleResult) builder = builder.single()
        const result = await builder
        if (result.error) throw result.error
        const returned = Array.isArray(result.data) ? result.data : (result.data ? [result.data] : [])
        await cacheQuery(this.table, returned)
        return result
      } catch (error) {
        if (!isNetworkError(error)) return { data: null, error }
        for (const row of rows) {
          await applyLocalMutation(this.table, 'insert', row, userId || row.user_id)
          await enqueue({ userId: userId || row.user_id, table: this.table, action: 'upsert', payload: row })
        }
        return { data: this.singleResult ? rows[0] : rows, error: null }
      }
    }

    const matched = await localSelect(
      this.table,
      userId,
      this.filters,
      [],
      null,
      true,
    )

    if (!online) {
      if (this.operation === 'update') {
        const updated = []
        for (const row of matched) {
          const next = { ...row, ...this.payload }
          await applyLocalMutation(this.table, 'update', next, userId || row.user_id)
          await enqueue({ userId: userId || row.user_id, table: this.table, action: 'upsert', payload: next })
          updated.push(next)
        }
        return { data: this.singleResult ? (updated[0] || null) : updated, error: null }
      }

      for (const row of matched) {
        await applyLocalMutation(this.table, 'delete', { id: row.id }, userId || row.user_id)
        await enqueue({ userId: userId || row.user_id, table: this.table, action: 'delete', payload: { id: row.id } })
      }
      return { data: null, error: null }
    }

    try {
      let builder = supabase.from(this.table)
      let query
      if (this.operation === 'update') query = builder.update(this.payload)
      else query = builder.delete()
      this.filters.forEach((filter) => query.eq(filter.column, filter.value))
      if (this.operation === 'update' && this.columns !== '*') {
        query = query.select(this.columns)
        if (this.singleResult) query = query.single()
      }
      const response = await query
      if (response.error) throw response.error
      if (response.data) {
        const rows = Array.isArray(response.data) ? response.data : [response.data]
        await cacheQuery(this.table, rows)
      }
      return response
    } catch (error) {
      if (!isNetworkError(error)) return { data: null, error }

      if (this.operation === 'update') {
        const updated = []
        for (const row of matched) {
          const next = { ...row, ...this.payload }
          await applyLocalMutation(this.table, 'update', next, userId || row.user_id)
          await enqueue({ userId: userId || row.user_id, table: this.table, action: 'upsert', payload: next })
          updated.push(next)
        }
        return { data: this.singleResult ? (updated[0] || null) : updated, error: null }
      }

      for (const row of matched) {
        await applyLocalMutation(this.table, 'delete', { id: row.id }, userId || row.user_id)
        await enqueue({ userId: userId || row.user_id, table: this.table, action: 'delete', payload: { id: row.id } })
      }
      return { data: null, error: null }
    }
  }
}

export const offlineSupabase = {
  from: (table) => new OfflineQuery(table),
  auth: supabase.auth,
  sync: syncQueue,
}
