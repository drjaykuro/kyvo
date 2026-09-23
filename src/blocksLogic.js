import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from './supabaseClient'

export const CATEGORY_COLORS = {
  spiritual: 'purple',
  work: 'green',
  study: 'blue',
  gym: 'orange',
  chores: 'grey',
  eat: 'brown',
  other: 'white',
}
export const SIZE_POINTS = { Small: 1, Medium: 2.3, Large: 3.5, Giant: 5 }
export const DIFFICULTY_MULTIPLIER = { easy: 1, medium: 1.5, hard: 2 }
export const BADGE_TIERS = [
  [1, 7, 'Foundation Block I'], [2, 14, 'Foundation Block II'], [3, 28, 'Foundation Block III'],
  [4, 60, 'Builder I'], [5, 90, 'Builder II'], [6, 150, 'Builder III'],
  [7, 240, 'Architect I'], [8, 360, 'Architect II'], [9, 450, 'Architect III'],
  [10, 540, 'Skyscraper I'], [11, 720, 'Skyscraper II'], [12, 900, 'Skyscraper III'],
  [13, 1080, 'Legacy I'], [14, 1260, 'Legacy II'], [15, 1440, 'Legacy III'],
]
export const MOTIVATIONAL_QUOTES = [
  'No place for fear and worry.', 'I can do all things.', 'I am not alone. I cannot be moved',
  'If God be for me, who can be against me?', 'Everything works for my good.', 'The just shall live by faith.',
  'Build me, then visibility.', 'Failure to plan will definitely amount to failure.', 'Fortune favours the bold.',
  'Ideas do not come out fully formed, they only become clear as you work on them.',
  'Have the courage to trust that it will all work out.', "Don't choose what to do, do what is right.",
  'If I am worth something later I am worth something now, for wheat is wheat, even if it looks like grass at the beginning.',
  'Tommorrow belongs to those who prepare for it today.', 'JESUS IS LORD.', 'Building your future, one block at a time.',
  'Build what you want to become.', 'Small blocks. Big future.', 'Every block counts.', 'Keep building.',
  'Your future is under construction.', 'Start with one block.', 'Build today. Become tomorrow.',
  'Progress is built, not wished for.', 'Your next block is waiting.', "You don't have to finish everything. Just build something.",
  "One missed day doesn't erase what you've built.", 'Start again. Add another block.', 'You can still build something today.',
  "The foundation doesn't have to be perfect.", "Don't wait for motivation. Place the first block.",
  'A small block is still progress.', "You've built before. You can build again.", "You don't need to rush. Just keep building.",
  "Today is another chance to add to what you've built.", 'Slow progress is still construction.', 'Breathe. Choose a block. Begin.',
  "You don't need a perfect day to make progress.",
]
export function toDateStr(d) { const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}` }
export function todayStr() { return toDateStr(new Date()) }
export function calculateBlockSize(startTime,endTime){const [sh,sm]=startTime.split(':').map(Number),[eh,em]=endTime.split(':').map(Number);let s=sh*60+sm,e=eh*60+em;if(e<=s)e+=1440;const minutes=e-s;if(minutes<=15)return'Small';if(minutes<=60)return'Medium';if(minutes<=180)return'Large';return'Giant'}
export function earliestCompletionTime(task){const[y,m,d]=task.date.split('-').map(Number),[sh,sm]=task.start_time.split(':').map(Number),[eh,em]=task.end_time.split(':').map(Number);const start=new Date(y,m-1,d,sh,sm);let end=new Date(y,m-1,d,eh,em);if(end<=start)end=new Date(end.getTime()+86400000);return new Date(end.getTime()-600000)}

// A streak day is earned when at least 75% of that day's scheduled tasks are completed.
// KYVO streaks are checkpoint-based:
//   1) Consecutive qualifying days build the active streak.
//   2) Reaching a badge milestone permanently secures that checkpoint.
//   3) A later missed day breaks the active run, but the user falls back to the
//      highest secured checkpoint instead of going back to zero.
//   4) After the checkpoint, a new active run builds on top of that checkpoint.
//
// Example: 7 consecutive days -> checkpoint 7. Miss 2 days -> 7.
// Complete 3 more qualifying days -> 10. Reach 14 -> checkpoint 14.
function getCompletedDayDates(tasks){
  const byDate=new Map(),today=todayStr()
  for(const task of tasks){
    if(!task.date||task.date>today)continue
    if(!byDate.has(task.date))byDate.set(task.date,[])
    byDate.get(task.date).push(task)
  }
  return new Set(
    [...byDate.entries()]
      .filter(([,dayTasks])=>{
        const completed=dayTasks.filter(task=>task.done).length
        return dayTasks.length>0&&completed/dayTasks.length>=0.75
      })
      .map(([date])=>date)
  )
}

function getRuns(completedDates){
  const dates=[...completedDates].sort()
  const runs=[]
  let start=null,previous=null
  for(const dateStr of dates){
    if(!start){
      start=dateStr
      previous=dateStr
      continue
    }
    const [y,m,d]=previous.split('-').map(Number)
    const next=new Date(y,m-1,d)
    next.setDate(next.getDate()+1)
    if(toDateStr(next)!==dateStr){
      runs.push({start,end:previous,length:daysBetween(start,previous)+1})
      start=dateStr
    }
    previous=dateStr
  }
  if(start)runs.push({start,end:previous,length:daysBetween(start,previous)+1})
  return runs
}

function daysBetween(startStr,endStr){
  const [sy,sm,sd]=startStr.split('-').map(Number)
  const [ey,em,ed]=endStr.split('-').map(Number)
  const start=new Date(sy,sm-1,sd)
  const end=new Date(ey,em-1,ed)
  return Math.round((end-start)/86400000)
}

function milestoneDateForRun(run,daysRequired){
  if(run.length<daysRequired)return null
  const [y,m,d]=run.start.split('-').map(Number)
  const date=new Date(y,m-1,d)
  date.setDate(date.getDate()+daysRequired-1)
  return toDateStr(date)
}

export function getHistoricalBestStreak(tasks){
  const completedDates=getCompletedDayDates(tasks)
  if(completedDates.size===0)return 0
  return Math.max(...getRuns(completedDates).map(run=>run.length))
}

function getCheckpoint(tasks){
  const completedDates=getCompletedDayDates(tasks)
  if(completedDates.size===0)return {days:0,date:null}

  let checkpointDays=0
  let checkpointDate=null
  for(const run of getRuns(completedDates)){
    for(const [,daysRequired] of BADGE_TIERS){
      if(run.length>=daysRequired && daysRequired>=checkpointDays){
        checkpointDays=daysRequired
        checkpointDate=milestoneDateForRun(run,daysRequired)
      }
    }
  }
  return {days:checkpointDays,date:checkpointDate}
}

function getActiveRun(completedDates){
  if(completedDates.size===0)return null
  const dates=[...completedDates].sort()
  const latest=dates[dates.length-1]
  const today=todayStr()
  const gapFromToday=daysBetween(latest,today)
  // A run only remains active through today or yesterday. Older runs are
  // historical and therefore contribute only through their secured checkpoint.
  if(gapFromToday>1)return null

  let start=latest
  let current=latest
  let length=1
  while(true){
    const [y,m,d]=start.split('-').map(Number)
    const previous=new Date(y,m-1,d)
    previous.setDate(previous.getDate()-1)
    const previousStr=toDateStr(previous)
    if(!completedDates.has(previousStr))break
    start=previousStr
    length+=1
  }
  return {start,end:current,length}
}

export function getStreak(tasks){
  const completedDates=getCompletedDayDates(tasks)
  if(completedDates.size===0)return 0

  const checkpoint=getCheckpoint(tasks)
  const activeRun=getActiveRun(completedDates)
  if(!activeRun)return checkpoint.days

  // If the secured milestone belongs to this active run, count from that
  // milestone forward. Otherwise this is a new run built on the checkpoint.
  if(checkpoint.date && daysBetween(activeRun.start,checkpoint.date)>=0 && daysBetween(checkpoint.date,activeRun.end)>=0){
    return checkpoint.days+daysBetween(checkpoint.date,activeRun.end)
  }
  return checkpoint.days+activeRun.length
}

export function getLevelAndBadge(tasks,storedLevel=0){
  const checkpoint=getCheckpoint(tasks)
  const earnedLevel=checkpoint.days===0
    ? 0
    : Math.max(...BADGE_TIERS.filter(([,daysRequired])=>daysRequired<=checkpoint.days).map(([lvl])=>lvl))
  const level=Math.max(Number(storedLevel)||0,earnedLevel)
  const badge=level>0?BADGE_TIERS[level-1][2]:'No badge yet'
  return{level,badge,streak:getStreak(tasks)}
}
export function getLevelProgress(streak,level){if(level>=BADGE_TIERS.length)return 100;const lo=level===0?0:BADGE_TIERS[level-1][1],hi=BADGE_TIERS[level][1],pct=((streak-lo)/(hi-lo))*100;return Math.min(100,Math.max(0,Math.round(pct)))}
export function getDailyScore(tasks,dayStr){const dayTasks=tasks.filter(t=>t.date===dayStr);let total=0;for(const task of dayTasks){const points=SIZE_POINTS[task.size]??1,multiplier=DIFFICULTY_MULTIPLIER[task.difficulty]??1,maxPoints=points*multiplier;if(task.subtasks&&task.subtasks.length>0){const completed=task.subtasks.filter(s=>s.done).length;total+=maxPoints*(completed/task.subtasks.length)}else if(task.done)total+=maxPoints}return total}
export function getMotivationalQuote(){return MOTIVATIONAL_QUOTES[Math.floor(Math.random()*MOTIVATIONAL_QUOTES.length)]}
export function getScheduledQuote(){const hour=new Date().getHours();if(hour===7)return`Good morning! ${getMotivationalQuote()}`;if(hour===21)return`Good night! ${getMotivationalQuote()}`;return null}
export function getDailyQuote(){const key=`blocks_daily_quote_${todayStr()}`,cached=localStorage.getItem(key);if(cached)return cached;const quote=getScheduledQuote()||getMotivationalQuote();localStorage.setItem(key,quote);return quote}
export function getPeriodStats(tasks,period){function daysBetween(dateStr){const[y,m,d]=dateStr.split('-').map(Number),taskDate=new Date(y,m-1,d),today=new Date();today.setHours(0,0,0,0);return Math.round((today-taskDate)/86400000)}const filtered=tasks.filter(t=>{if(period==='all')return true;const db=daysBetween(t.date);if(period==='day')return db===0;if(period==='week')return db>=0&&db<7;if(period==='month')return db>=0&&db<30;if(period==='year')return db>=0&&db<365;return true});const totalTasks=filtered.length,completedTasks=filtered.filter(t=>t.done).length,completionRate=totalTasks?Math.round(completedTasks/totalTasks*100):0,blocksBuilt=completedTasks+filtered.reduce((sum,t)=>sum+(t.subtasks||[]).filter(s=>s.done).length,0),uniqueDates=[...new Set(filtered.map(t=>t.date))],xpEarned=uniqueDates.reduce((sum,d)=>sum+getDailyScore(tasks,d),0);function taskMinutes(t){const[sh,sm]=t.start_time.split(':').map(Number),[eh,em]=t.end_time.split(':').map(Number);let s=sh*60+sm,e=eh*60+em;if(e<=s)e+=1440;return e-s}const timeFocusedHours=Math.round(filtered.filter(t=>t.done).reduce((sum,t)=>sum+taskMinutes(t),0)/60*10)/10;return{totalTasks,completedTasks,completionRate,blocksBuilt,xpEarned:+xpEarned.toFixed(1),timeFocusedHours}}
export const CATEGORY_COLOR_HEX={spiritual:'#a855f7',work:'var(--green)',study:'#3b82f6',gym:'#f97316',chores:'#8891a8',eat:'#b5563c',other:'#e8ebf5'}
export function taskDurationMinutes(t){const[sh,sm]=t.start_time.split(':').map(Number),[eh,em]=t.end_time.split(':').map(Number);let s=sh*60+sm,e=eh*60+em;if(e<=s)e+=1440;return e-s}
export function getAllTimeScore(tasks){const uniqueDates=[...new Set(tasks.map(t=>t.date))];return+uniqueDates.reduce((sum,d)=>sum+getDailyScore(tasks,d),0).toFixed(1)}
export function getSevenDayStats(tasks){const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const dayStr=toDateStr(d),dayTasks=tasks.filter(t=>t.date===dayStr),completed=dayTasks.filter(t=>t.done).length,total=dayTasks.length,plannedHours=+(dayTasks.reduce((s,t)=>s+taskDurationMinutes(t),0)/60).toFixed(1),completedHours=+(dayTasks.filter(t=>t.done).reduce((s,t)=>s+taskDurationMinutes(t),0)/60).toFixed(1);days.push({date:dayStr,completed,total,plannedHours,completedHours})}return days}
export function getDifficultyBreakdown(tasks){const done=tasks.filter(t=>t.done),counts={easy:0,medium:0,hard:0};done.forEach(t=>{if(counts[t.difficulty]!==undefined)counts[t.difficulty]+=1});const total=done.length,pct={};Object.keys(counts).forEach(k=>{pct[k]=total?Math.round(counts[k]/total*100):0});return{counts,pct,total}}
export function getCategoryBreakdown(tasks){const done=tasks.filter(t=>t.done),counts={};done.forEach(t=>{counts[t.category]=(counts[t.category]||0)+1});return counts}
function parseRecurrence(value){if(!value)return null;try{return JSON.parse(value)}catch{return null}}
function nextCustomDate(template){
  const rule=parseRecurrence(template.recurring);if(!rule||rule.type!=='custom')return null
  const [y,m,d]=template.date.split('-').map(Number),current=new Date(y,m-1,d)
  if(rule.mode==='interval'){const next=new Date(current);next.setDate(next.getDate()+Math.max(1,Number(rule.interval)||1));return next}
  if(rule.mode==='weekly'){
    const days=[...(rule.days||[])].map(Number).filter(Number.isInteger)
    if(!days.length)return null
    for(let offset=1;offset<=7;offset++){const next=new Date(current);next.setDate(next.getDate()+offset);if(days.includes(next.getDay()))return next}
  }
  if(rule.mode==='monthly'){
    const target=Math.min(31,Math.max(1,Number(rule.day)||current.getDate()))
    const next=new Date(y,m+1,1)
    const lastDay=new Date(next.getFullYear(),next.getMonth()+1,0).getDate()
    next.setDate(Math.min(target,lastDay));return next
  }
  return null
}
export function getMissingRecurringInstances(tasks){
  const templates=tasks.filter(t=>t.recurring),toCreate=[]
  for(const template of templates){
    const baseFields={user_id:template.user_id,name:template.name,done:false,start_time:template.start_time,end_time:template.end_time,recurring:template.recurring,category:template.category,color:template.color,size:template.size,difficulty:template.difficulty,miss_reason:null,actual_end_time:null,actual_duration_minutes:null}
    const [y,m,d]=template.date.split('-').map(Number),originalDate=new Date(y,m-1,d),nextDate=new Date(originalDate)
    if(template.recurring==='daily')nextDate.setDate(nextDate.getDate()+1)
    else if(template.recurring==='weekly')nextDate.setDate(nextDate.getDate()+7)
    else if(template.recurring.startsWith('{')){const custom=nextCustomDate(template);if(custom)nextDate.setTime(custom.getTime());else continue}
    else continue
    const nextDateString=toDateStr(nextDate)
    const alreadyExists=tasks.some(t=>t.name===template.name&&t.date===nextDateString&&t.recurring===template.recurring)
    if(!alreadyExists)toCreate.push({...baseFields,date:nextDateString})
  }
  return toCreate
}
export function goalAchievedMessage(goal){return goal?.name?`Goal achieved: ${goal.name}`:'Goal achieved!'}
