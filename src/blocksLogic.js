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
// This keeps KYVO motivating without requiring a perfect day.
function getCompletedDayDates(tasks){
  const byDate=new Map(),today=todayStr()
  for(const task of tasks){if(!task.date||task.date>today)continue;if(!byDate.has(task.date))byDate.set(task.date,[]);byDate.get(task.date).push(task)}
  return new Set([...byDate.entries()].filter(([,dayTasks])=>{const completed=dayTasks.filter(task=>task.done).length;return dayTasks.length>0&&completed/dayTasks.length>=0.75}).map(([date])=>date))
}
export function getHistoricalBestStreak(tasks){
  const completedDates=getCompletedDayDates(tasks);if(completedDates.size===0)return 0
  const dates=[...completedDates].sort();let best=0,run=0,previous=null
  for(const dateStr of dates){if(previous){const[y,m,d]=previous.split('-').map(Number),next=new Date(y,m-1,d);next.setDate(next.getDate()+1);run=toDateStr(next)===dateStr?run+1:1}else run=1;best=Math.max(best,run);previous=dateStr}return best
}
export function getStreak(tasks){
  let streak=0,currentDay=new Date(),todayString=todayStr()
  while(true){const dayStr=toDateStr(currentDay),dayTasks=tasks.filter(t=>t.date===dayStr)
    if(dayTasks.length===0){if(dayStr===todayString){currentDay=new Date(currentDay.getTime()-86400000);continue}break}
    const completedCount=dayTasks.filter(t=>t.done).length,completionRate=completedCount/dayTasks.length
    if(completionRate>=0.75){streak+=1;currentDay=new Date(currentDay.getTime()-86400000)}
    else if(dayStr===todayString){currentDay=new Date(currentDay.getTime()-86400000);continue}
    else break
  }
  const historicalBest=getHistoricalBestStreak(tasks);let checkpoint=0
  for(const[,daysRequired]of BADGE_TIERS){if(historicalBest>=daysRequired)checkpoint=daysRequired;else break}
  return Math.max(streak,checkpoint)
}
export function getLevelAndBadge(tasks,storedLevel=0){const streak=getStreak(tasks),historicalBest=getHistoricalBestStreak(tasks);let earnedLevel=0,earnedBadge='No badge yet';for(const[lvl,daysRequired,badgeName]of BADGE_TIERS){if(historicalBest>=daysRequired){earnedLevel=lvl;earnedBadge=badgeName}else break}const level=Math.max(Number(storedLevel)||0,earnedLevel),badge=level>0?BADGE_TIERS[level-1][2]:earnedBadge;return{level,badge,streak}}
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
export function getMissingRecurringInstances(tasks){const templates=tasks.filter(t=>t.recurring),toCreate=[];for(const template of templates){const baseFields={user_id:template.user_id,name:template.name,done:false,start_time:template.start_time,end_time:template.end_time,recurring:template.recurring,category:template.category,color:template.color,size:template.size,difficulty:template.difficulty,miss_reason:null,actual_end_time:null};const[y,m,d]=template.date.split('-').map(Number),originalDate=new Date(y,m-1,d),nextDate=new Date(originalDate);if(template.recurring==='daily')nextDate.setDate(nextDate.getDate()+1);else if(template.recurring==='weekly')nextDate.setDate(nextDate.getDate()+7);else continue;const nextDateString=toDateStr(nextDate),alreadyExists=tasks.some(t=>t.name===template.name&&t.date===nextDateString&&t.recurring===template.recurring);if(!alreadyExists)toCreate.push({...baseFields,date:nextDateString})}return toCreate}
export function goalAchievedMessage(goal){return goal?.name?`Goal achieved: ${goal.name}`:'Goal achieved!'}
