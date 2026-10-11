import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Archive, ArrowDownUp, ArrowLeft, ArrowRight, Bell, Calendar, CalendarDays,
  Check, CheckCheck, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Circle,
  CircleHelp, Clock3, Command, Download, Ellipsis, FileUp, Filter, Flag, Folder,
  FolderOpen, Goal, Grid2X2, Hash, Home, Inbox, Keyboard, LayoutDashboard, List,
  ListChecks, Menu, Moon, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, Search,
  Settings, SlidersHorizontal, Sparkles, Sun, Tag, Timer, Trash2, TrendingUp, Undo2,
  X, Zap, CalendarClock, Repeat2, CircleDot, Paperclip, Link2, History, CheckSquare,
  ChevronUp, RotateCcw, CalendarCheck, Target, Hourglass, Save, ExternalLink
} from 'lucide-react';

const STORE_KEY = 'daymark.workspace.v1';
const CLEAN_START_KEY = 'daymark.clean-start.v2';
// This release intentionally removes the bundled demo workspace once, then preserves user data normally.
const SHOULD_RESET_WORKSPACE = (() => { try { return !localStorage.getItem(CLEAN_START_KEY); } catch { return false; } })();
const mysqlApiEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_MYSQL_API === 'true';
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const addDays = (iso, n) => {
  const d = new Date(`${iso || todayISO()}T12:00:00`);
  d.setDate(d.getDate()+n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const safeParse = (v, fallback) => { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const dateLabel = (iso) => {
  if (!iso) return '';
  if (iso === todayISO()) return 'Today';
  if (iso === addDays(todayISO(),1)) return 'Tomorrow';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
};
const seedData = () => ({
  version: 2,
  tasks: [],
  projects: [],
  habits: [],
  goals: [],
  sessions: [],
  settings: {theme:'dark',weekStart:'monday',dateFormat:'local',timeFormat:'24h',startPage:'myday',sidebarCollapsed:false,compact:false,notifications:false,firstRun:true},
  deleted: [],
  history: []
});

function loadStore() {
  const defaults = seedData();
  if (SHOULD_RESET_WORKSPACE) {
    try { localStorage.removeItem(STORE_KEY); localStorage.setItem(CLEAN_START_KEY, 'done'); } catch {}
    return defaults;
  }
  const parsed = safeParse(localStorage.getItem(STORE_KEY), null);
  if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.projects)) return defaults;
  return {
    ...defaults,
    ...parsed,
    habits: Array.isArray(parsed.habits) ? parsed.habits : defaults.habits,
    goals: Array.isArray(parsed.goals) ? parsed.goals : defaults.goals,
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : defaults.sessions,
    deleted: Array.isArray(parsed.deleted) ? parsed.deleted : defaults.deleted,
    history: Array.isArray(parsed.history) ? parsed.history : defaults.history,
    settings: { ...defaults.settings, ...(parsed.settings || {}) }
  };
}
function saveStore(store) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); return true; }
  catch { return false; }
}
const mergeWorkspace = (current, incoming) => ({
  ...current,
  ...incoming,
  tasks: [...(current.tasks || []), ...(incoming.tasks || []).filter(item => !(current.tasks || []).some(existing => existing.id === item.id))],
  projects: [...(current.projects || []), ...(incoming.projects || []).filter(item => !(current.projects || []).some(existing => existing.id === item.id))],
  habits: [...(current.habits || []), ...(incoming.habits || []).filter(item => !(current.habits || []).some(existing => existing.id === item.id))],
  goals: [...(current.goals || []), ...(incoming.goals || []).filter(item => !(current.goals || []).some(existing => existing.id === item.id))],
  sessions: [...(current.sessions || []), ...(incoming.sessions || []).filter(item => !(current.sessions || []).some(existing => existing.id === item.id))],
  deleted: [...(current.deleted || []), ...(incoming.deleted || []).filter(item => !(current.deleted || []).some(existing => existing.id === item.id))],
  history: [...(current.history || []), ...(incoming.history || []).filter(item => !(current.history || []).some(existing => existing.id === item.id))].slice(-100),
  settings: { ...(current.settings || {}), ...(incoming.settings || {}) }
});
const priorityRank = {urgent:0, high:1, medium:2, low:3, none:4};
const projectColor = (id, projects) => projects.find(p=>p.id===id)?.color || '#8992a7';
const initials = s => (s||'').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();

function App() {
  const [store,setStore] = useState(loadStore);
  const [dbStatus,setDbStatus] = useState('connecting');
  const databaseReadyRef = useRef(false);
  const [page,setPage] = useState(store.settings.startPage || 'myday');
  const [activeProject,setActiveProject] = useState(null);
  const [activeTask,setActiveTask] = useState(null);
  const [query,setQuery] = useState('');
  const [filterPriority,setFilterPriority] = useState('all');
  const [filterStatus,setFilterStatus] = useState('all');
  const [sortBy,setSortBy] = useState('manual');
  const [showFilters,setShowFilters] = useState(false);
  const [showCommand,setShowCommand] = useState(false);
  const [showQuickAdd,setShowQuickAdd] = useState(false);
  const [quickTitle,setQuickTitle] = useState('');
  const [showSettings,setShowSettings] = useState(false);
  const [showReview,setShowReview] = useState(false);
  const [toast,setToast] = useState('');
  const [undoSnapshot,setUndoSnapshot] = useState(null);
  const [undoLabel,setUndoLabel] = useState('');
  const [calendarMonth,setCalendarMonth] = useState(new Date());
  const [timerSeconds,setTimerSeconds] = useState(25*60);
  const [timerRunning,setTimerRunning] = useState(false);
  const [timerMode,setTimerMode] = useState('focus');
  const [timerSessions,setTimerSessions] = useState(0);
  const [mobileNav,setMobileNav] = useState(false);
  const [showNewProject,setShowNewProject] = useState(false);
  const [projectName,setProjectName] = useState('');
  const [newTaskProject,setNewTaskProject] = useState('');
  const [newTaskDate,setNewTaskDate] = useState(todayISO());
  const [newTaskPriority,setNewTaskPriority] = useState('medium');
  const [newTaskTime,setNewTaskTime] = useState('');
  const [newTaskTags,setNewTaskTags] = useState('');
  const [newTaskRecurrence,setNewTaskRecurrence] = useState('none');
  const [newTaskEstimate,setNewTaskEstimate] = useState('30');
  const [newTaskDescription,setNewTaskDescription] = useState('');
  const [habitName,setHabitName] = useState('');
  const [goalName,setGoalName] = useState('');
  const [goalTarget,setGoalTarget] = useState('10');
  const [importError,setImportError] = useState('');
  const fileInputRef = useRef(null);
  const quickInputRef = useRef(null);

  useEffect(() => {
    if (!mysqlApiEnabled) {
      databaseReadyRef.current = true;
      setDbStatus('local');
      return;
    }
    let cancelled = false;
    const localWorkspace = store;
    const writeWorkspace = async workspace => {
      const response = await fetch('/api/workspace', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace })
      });
      if (!response.ok) throw new Error('MySQL workspace save is unavailable');
    };
    (async () => {
      try {
        if (SHOULD_RESET_WORKSPACE) {
          await writeWorkspace(localWorkspace);
          if (cancelled) return;
          databaseReadyRef.current = true;
          setDbStatus('connected');
          return;
        }
        const response = await fetch('/api/workspace', { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('MySQL API unavailable');
        const result = await response.json();
        if (cancelled) return;
        if (result.workspace && Array.isArray(result.workspace.tasks) && Array.isArray(result.workspace.projects)) {
          const defaults = seedData();
          const restored = { ...defaults, ...result.workspace, settings: { ...defaults.settings, ...(result.workspace.settings || {}) } };
          saveStore(restored);
          setStore(restored);
        } else {
          await writeWorkspace(localWorkspace);
          if (cancelled) return;
        }
        databaseReadyRef.current = true;
        setDbStatus('connected');
      } catch {
        if (cancelled) return;
        databaseReadyRef.current = true;
        setDbStatus('local');
      }
    })();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    saveStore(store);
    if (!mysqlApiEnabled || !databaseReadyRef.current) return;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/workspace', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspace: store })
        });
        if (!response.ok) throw new Error('Database save failed');
        setDbStatus('connected');
      } catch {
        setDbStatus('local');
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [store]);
  useEffect(()=>{ document.documentElement.dataset.theme = store.settings.theme === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark') : store.settings.theme; },[store.settings.theme]);
  useEffect(()=>{
    if (!timerRunning) return;
    const id = setInterval(()=>{
      setTimerSeconds(s=>{
        if (s <= 1) {
          setTimerRunning(false);
          setToast(timerMode==='focus'?'Focus session complete. Take a short break.':'Break complete. Ready for another focus session?');
          if (timerMode==='focus') { setTimerSessions(n=>n+1); setStore(old=>({...old,sessions:[...old.sessions,{id:uid(),date:todayISO(),minutes:25,createdAt:Date.now()}]})); }
          return timerMode==='focus'?5*60:25*60;
        }
        return s-1;
      });
    },1000);
    return ()=>clearInterval(id);
  },[timerRunning,timerMode]);
  useEffect(()=>{
    if (!toast) return;
    const id=setTimeout(()=>setToast(''),4200);
    return ()=>clearTimeout(id);
  },[toast]);
  useEffect(()=>{
    const onKey = e => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const typing = ['input','textarea','select'].includes(tag) || document.activeElement?.isContentEditable;
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='k') {e.preventDefault();setShowCommand(v=>!v);return;}
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='n') {e.preventDefault();setShowQuickAdd(true);setTimeout(()=>quickInputRef.current?.focus(),50);return;}
      if (e.key==='Escape') {setShowCommand(false);setShowQuickAdd(false);setShowSettings(false);setShowReview(false);setActiveTask(null);return;}
      if (!typing && e.key==='/') {e.preventDefault();document.querySelector('[data-search]')?.focus();}
      if (!typing && e.key==='?') setToast('Shortcuts: ⌘K command palette · ⌘N new task · / search · Esc close');
      if (!typing && e.key==='z' && (e.metaKey||e.ctrlKey)) doUndo();
    };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  });

  const updateStore = useCallback(fn => setStore(old => typeof fn==='function'?fn(old):fn),[]);
  const pushHistory = (s, label) => ({...s,history:[...(s.history||[]).slice(-49),{id:uid(),label,at:Date.now()}]});
  const snapshotBefore = label => { setUndoSnapshot(store); setUndoLabel(label); };
  const doUndo = () => {
    if (!undoSnapshot) { setToast('Nothing to undo yet.'); return; }
    setStore(undoSnapshot); setUndoSnapshot(null); setToast(`${undoLabel||'Change'} undone.`);
  };
  const mutate = (label,fn,undo=true) => {
    if (undo) snapshotBefore(label);
    setStore(old=>pushHistory(fn(old),label));
  };
  const projects = store.projects;
  const tasks = store.tasks;
  const currentProject = projects.find(p=>p.id===activeProject);
  const completedCount = tasks.filter(t=>t.status==='done').length;
  const todayTasks = tasks.filter(t=>t.dueDate===todayISO() && t.status!=='done');
  const overdueTasks = tasks.filter(t=>t.dueDate && t.dueDate<todayISO() && t.status!=='done');
  const pageTitle = currentProject?.name || ({
    myday:'My Day', inbox:'Inbox', upcoming:'Upcoming', completed:'Completed',
    all:'All tasks', board:'Board', calendar:'Calendar', analytics:'Insights',
    habits:'Habits', goals:'Goals', focus:'Focus timer', review:'Weekly review', settings:'Settings'
  }[page] || 'My Day');

  const visibleTasks = useMemo(()=>{
    let arr=[...tasks];
    if (activeProject) arr=arr.filter(t=>t.projectId===activeProject);
    else if (page==='myday') arr=arr.filter(t=>t.dueDate===todayISO() && t.status!=='archived');
    else if (page==='inbox') arr=arr.filter(t=>!t.projectId || t.projectId==='inbox');
    else if (page==='upcoming') arr=arr.filter(t=>t.dueDate && t.dueDate>=todayISO() && t.status!=='done' && t.status!=='archived');
    else if (page==='completed') arr=arr.filter(t=>t.status==='done');
    else if (page==='all' || page==='board' || page==='calendar') arr=arr.filter(t=>t.status!=='archived');
    else if (page==='review') arr=arr.filter(t=>t.status!=='archived');
    if (filterPriority!=='all') arr=arr.filter(t=>t.priority===filterPriority);
    if (filterStatus!=='all') arr=arr.filter(t=>t.status===filterStatus);
    if (query.trim()) {
      const q=query.toLowerCase();
      arr=arr.filter(t=>[t.title,t.description,t.section,...(t.tags||[])].some(v=>(v||'').toLowerCase().includes(q)));
    }
    if (sortBy==='due') arr.sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999') || (a.dueTime||'').localeCompare(b.dueTime||''));
    else if (sortBy==='priority') arr.sort((a,b)=>priorityRank[a.priority]-priorityRank[b.priority]);
    else if (sortBy==='created') arr.sort((a,b)=>b.createdAt-a.createdAt);
    else arr.sort((a,b)=>(a.order??0)-(b.order??0));
    return arr;
  },[tasks,activeProject,page,filterPriority,filterStatus,query,sortBy]);

  const addTask = (title, extra={}) => {
    const clean=title.trim();
    if (!clean) {setToast('Add a task title first.');return;}
    const task={id:uid(),title:clean,description:extra.description??newTaskDescription,status:'todo',priority:extra.priority??newTaskPriority,dueDate:extra.dueDate??newTaskDate,dueTime:extra.dueTime??newTaskTime,projectId:extra.projectId??(activeProject||newTaskProject||undefined),section:extra.section||'',tags:extra.tags??newTaskTags.split(',').map(x=>x.trim()).filter(Boolean),estimate:Number(extra.estimate??newTaskEstimate)||0,actual:0,createdAt:Date.now(),completedAt:null,subtasks:[],links:[],history:[],recurrence:extra.recurrence??newTaskRecurrence,dependencies:[],order:Math.max(0,...tasks.map(t=>t.order||0))+1};
    mutate('Task created',s=>({...s,tasks:[...s.tasks,task]}));
    setQuickTitle('');setNewTaskDescription('');setNewTaskTags('');setShowQuickAdd(false);setToast('Task added.');
  };
  const updateTask = (id, patch, label='Task updated') => mutate(label,s=>({...s,tasks:s.tasks.map(t=>t.id===id?{...t,...patch,history:[...(t.history||[]),{label,at:Date.now()}]}:t)}));
  const deleteTask = id => {
    const t=tasks.find(x=>x.id===id); if(!t)return;
    mutate('Task deleted',s=>({...s,tasks:s.tasks.filter(x=>x.id!==id),deleted:[...(s.deleted||[]),{...t,deletedAt:Date.now()}]}));
    setActiveTask(null);setToast('Task moved to recovery. Undo is available.');
  };
  const completeTask = t => {
    const done=t.status!=='done';
    let nextDue=t.dueDate;
    if (done && t.recurrence && t.recurrence!=='none') {
      const base=t.recurrenceBase==='completion'?todayISO():(t.dueDate||todayISO());
      nextDue=addDays(base,t.recurrence==='daily'?1:t.recurrence==='weekly'?7:t.recurrence==='monthly'?30:Number(t.recurrence)||1);
    }
    mutate(done?'Task completed':'Task reopened',s=>{
      let nextTasks=s.tasks.map(x=>x.id===t.id?{...x,status:done?'done':'todo',completedAt:done?Date.now():null,history:[...(x.history||[]),{label:done?'Completed':'Reopened',at:Date.now()}]}:x);
      if(done && t.recurrence && t.recurrence!=='none'){
        nextTasks.push({...t,id:uid(),status:'todo',dueDate:nextDue,createdAt:Date.now(),completedAt:null,subtasks:(t.subtasks||[]).map(x=>({...x,id:uid(),done:false})),history:[],order:Math.max(0,...nextTasks.map(x=>x.order||0))+1});
        nextTasks=nextTasks.map(x=>x.id===t.id?{...x,recurrence:'none'}:x);
      }
      return {...s,tasks:nextTasks};
    });
    setToast(done?'Task completed.':'Task reopened.');
  };
  const createProject = () => {
    if(!projectName.trim())return;
    const id=uid();
    mutate('Project created',s=>({...s,projects:[...s.projects,{id,name:projectName.trim(),color:['#8da7f5','#c1a0ed','#e2b477','#82b6a0','#e28c9b'][s.projects.length%5],sections:['General']}]}));
    setProjectName('');setShowNewProject(false);setActiveProject(id);setPage('all');setToast('Project created.');
  };
  const exportJSON = () => {
    const blob=new Blob([JSON.stringify({...store,exportedAt:new Date().toISOString(),app:'DAYMARK'},null,2)],{type:'application/json'});
    downloadBlob(blob,`daymark-backup-${todayISO()}.json`);setToast('Backup exported.');
  };
  const exportCSV = () => {
    const headers=['title','description','status','priority','dueDate','dueTime','project','section','tags','estimate','actual','recurrence'];
    const rows=tasks.map(t=>[t.title,t.description,t.status,t.priority,t.dueDate,t.dueTime,projects.find(p=>p.id===t.projectId)?.name||'',t.section,(t.tags||[]).join(';'),t.estimate,t.actual,t.recurrence]);
    const csv=[headers,...rows].map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
    downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8;'}),`daymark-tasks-${todayISO()}.csv`);
    setToast('CSV exported.');
  };
  const importJSON = async file => {
    setImportError('');
    try {
      const text=await file.text();const data=JSON.parse(text);
      if(!data||!Array.isArray(data.tasks)||!Array.isArray(data.projects))throw new Error('This file does not look like a Daymark backup.');
      if(!window.confirm('Restore this DAYMARK backup? The next prompt lets you choose replace or merge.'))return;
      const replace=window.confirm('Choose OK to replace the current workspace. Choose Cancel to merge imported records.');
      if(replace) {
        const defaults = seedData();
        setStore({ ...defaults, ...data, habits: Array.isArray(data.habits) ? data.habits : defaults.habits, goals: Array.isArray(data.goals) ? data.goals : defaults.goals, sessions: Array.isArray(data.sessions) ? data.sessions : defaults.sessions, deleted: Array.isArray(data.deleted) ? data.deleted : [], history: Array.isArray(data.history) ? data.history : [], settings: { ...defaults.settings, ...(data.settings || {}) } });
      } else {
        setStore(old => mergeWorkspace(old, data));
      }
      setToast('Backup imported successfully.');
    } catch(e) {setImportError(e.message||'Could not import this file.');}
  };
  const downloadBlob = (blob,name) => { const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.style.display='none'; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(()=>URL.revokeObjectURL(url),1000); };
  const startNewTask = () => {setShowQuickAdd(true);setTimeout(()=>quickInputRef.current?.focus(),30);};
  const openPage = p => {setPage(p);setActiveProject(null);setMobileNav(false);setQuery('');};
  const openProject = p => {setActiveProject(p.id);setPage('all');setMobileNav(false);setQuery('');};
  const commands = [
    {label:'Create a task',hint:'⌘ N',icon:Plus,action:startNewTask},
    {label:'Go to My Day',icon:Sun,action:()=>openPage('myday')},
    {label:'Open Inbox',icon:Inbox,action:()=>openPage('inbox')},
    {label:'View Upcoming',icon:CalendarDays,action:()=>openPage('upcoming')},
    {label:'Open all tasks',icon:ListChecks,action:()=>openPage('all')},
    {label:'Open insights',icon:TrendingUp,action:()=>openPage('analytics')},
    {label:'Focus timer',icon:Timer,action:()=>openPage('focus')},
    {label:'Weekly review',icon:CalendarCheck,action:()=>setShowReview(true)},
    {label:'Settings',icon:Settings,action:()=>setShowSettings(true)}
  ];
  const progress=tasks.length?Math.round(completedCount/tasks.length*100):0;
  const pageHasTasks=['myday','inbox','upcoming','completed','all','review'].includes(page) || (!!activeProject && !['board','calendar','analytics','habits','goals','focus'].includes(page));

  return (
    <div className={`app-shell ${store.settings.compact?'compact':''}`}>
      <aside className={`sidebar ${store.settings.sidebarCollapsed?'collapsed':''} ${mobileNav?'mobile-open':''}`}>
        <div className="brand-row">
          <div className="brand-mark"><Check size={19}/></div>
          {!store.settings.sidebarCollapsed&&<div className="brand-copy"><strong>daymark</strong><span>Personal workspace</span></div>}
          <button className="icon-btn sidebar-toggle" title="Collapse sidebar" onClick={()=>updateStore(s=>({...s,settings:{...s.settings,sidebarCollapsed:!s.settings.sidebarCollapsed}}))}><PanelLeftClose size={16}/></button>
        </div>
        <button className="workspace-switch" onClick={()=>setShowSettings(true)}><span className="avatar">A</span>{!store.settings.sidebarCollapsed&&<><span className="workspace-text"><b>My workspace</b><small>Personal plan</small></span><ChevronDown size={14}/></>}</button>
        <button className="search-trigger" onClick={()=>setShowCommand(true)}><Search size={15}/>{!store.settings.sidebarCollapsed&&<><span>Search anything</span><kbd>⌘ K</kbd></>}</button>
        <nav className="nav-groups">
          <div className="nav-caption">{!store.settings.sidebarCollapsed&&'WORKSPACE'}</div>
          <NavItem icon={Sun} label="My Day" count={todayTasks.length} active={page==='myday'&&!activeProject} collapsed={store.settings.sidebarCollapsed} onClick={()=>openPage('myday')}/>
          <NavItem icon={Inbox} label="Inbox" count={tasks.filter(t=>!t.projectId||t.projectId==='inbox').length} active={page==='inbox'} collapsed={store.settings.sidebarCollapsed} onClick={()=>openPage('inbox')}/>
          <NavItem icon={CalendarDays} label="Upcoming" active={page==='upcoming'} collapsed={store.settings.sidebarCollapsed} onClick={()=>openPage('upcoming')}/>
          <NavItem icon={CheckCircle2} label="Completed" count={completedCount} active={page==='completed'} collapsed={store.settings.sidebarCollapsed} onClick={()=>openPage('completed')}/>
          <NavItem icon={ListChecks} label="All tasks" active={page==='all'&&!activeProject} collapsed={store.settings.sidebarCollapsed} onClick={()=>openPage('all')}/>
          <div className="nav-caption nav-caption-spaced">{!store.settings.sidebarCollapsed&&'PRODUCTIVITY'}</div>
          <NavItem icon={Grid2X2} label="Board" active={page==='board'} collapsed={store.settings.sidebarCollapsed} onClick={()=>openPage('board')}/>
          <NavItem icon={Calendar} label="Calendar" active={page==='calendar'} collapsed={store.settings.sidebarCollapsed} onClick={()=>openPage('calendar')}/>
          <NavItem icon={TrendingUp} label="Insights" active={page==='analytics'} collapsed={store.settings.sidebarCollapsed} onClick={()=>openPage('analytics')}/>
          <NavItem icon={Target} label="Habits & goals" active={page==='habits'||page==='goals'} collapsed={store.settings.sidebarCollapsed} onClick={()=>openPage('habits')}/>
          <NavItem icon={Timer} label="Focus timer" active={page==='focus'} collapsed={store.settings.sidebarCollapsed} onClick={()=>openPage('focus')}/>
          <div className="projects-head"><span className="nav-caption">{!store.settings.sidebarCollapsed&&'PROJECTS'}</span><button className="tiny-icon" title="New project" onClick={()=>setShowNewProject(true)}><Plus size={15}/></button></div>
          {projects.map(p=><button key={p.id} title={p.name} className={`project-nav ${activeProject===p.id?'active':''} ${store.settings.sidebarCollapsed?'collapsed':''}`} onClick={()=>openProject(p)}><span className="project-dot" style={{background:p.color}}/>{!store.settings.sidebarCollapsed&&<><span>{p.name}</span><span className="project-count">{tasks.filter(t=>t.projectId===p.id&&t.status!=='done').length||''}</span></>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={()=>setShowReview(true)}><CalendarCheck size={16}/>{!store.settings.sidebarCollapsed&&<span>Weekly review</span>}</button>
          <button className="nav-item" onClick={()=>setShowSettings(true)}><Settings size={16}/>{!store.settings.sidebarCollapsed&&<span>Settings</span>}</button>
          <div className="sidebar-user"><div className="avatar">A</div>{!store.settings.sidebarCollapsed&&<div className="user-copy"><b>Personal</b><small>{dbStatus === 'connected' ? 'MySQL connected' : dbStatus === 'connecting' ? 'Connecting to database…' : 'Browser storage mode'}</small></div>}<button className="tiny-icon" title="Help and shortcuts" onClick={()=>setToast('Shortcuts: ⌘K command palette · ⌘N new task · / search · Esc close')}><CircleHelp size={15}/></button></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-btn mobile-menu" onClick={()=>setMobileNav(v=>!v)}><Menu size={18}/></button>
          <div className="breadcrumbs"><span>Workspace</span><ChevronRight size={13}/><strong>{pageTitle}</strong></div>
          <div className="topbar-actions">
            <button className="icon-btn" title="Search" onClick={()=>setShowCommand(true)}><Search size={17}/></button>
            <button className="icon-btn" title="Toggle theme" onClick={()=>updateStore(s=>({...s,settings:{...s.settings,theme:document.documentElement.dataset.theme==='dark'?'light':'dark'}}))}>{document.documentElement.dataset.theme==='dark'?<Sun size={17}/>:<Moon size={17}/>}</button>
            <button className="icon-btn notification-btn" title="Notifications" onClick={()=>setToast(overdueTasks.length?`You have ${overdueTasks.length} overdue task${overdueTasks.length===1?'':'s'}.`:'You are all caught up.')}><Bell size={17}/>{overdueTasks.length>0&&<i/>}</button>
            <div className="top-avatar">A</div>
          </div>
        </header>

        <div className="content-wrap">
          {pageHasTasks && <TaskPage
            page={page} pageTitle={pageTitle} currentProject={currentProject} visibleTasks={visibleTasks}
            allTasks={tasks} projects={projects} todayTasks={todayTasks} overdueTasks={overdueTasks}
            query={query} setQuery={setQuery} filterPriority={filterPriority} setFilterPriority={setFilterPriority}
            filterStatus={filterStatus} setFilterStatus={setFilterStatus} sortBy={sortBy} setSortBy={setSortBy}
            showFilters={showFilters} setShowFilters={setShowFilters} startNewTask={startNewTask}
            completeTask={completeTask} setActiveTask={setActiveTask} updateTask={updateTask}
            setShowReview={setShowReview} progress={progress} openPage={openPage}
          />}
          {page==='board'&&<BoardPage tasks={visibleTasks} projects={projects} completeTask={completeTask} setActiveTask={setActiveTask} updateTask={updateTask} startNewTask={startNewTask}/>}
          {page==='calendar'&&<CalendarPage tasks={tasks.filter(t=>t.status!=='archived')} month={calendarMonth} setMonth={setCalendarMonth} setActiveTask={setActiveTask} startNewTask={startNewTask}/>}
          {page==='analytics'&&<AnalyticsPage tasks={tasks} projects={projects} sessions={store.sessions} progress={progress}/>}
          {(page==='habits'||page==='goals')&&<HabitsGoalsPage page={page} store={store} updateStore={updateStore} habitName={habitName} setHabitName={setHabitName} goalName={goalName} setGoalName={setGoalName} goalTarget={goalTarget} setGoalTarget={setGoalTarget}/>}
          {page==='focus'&&<FocusPage seconds={timerSeconds} setSeconds={setTimerSeconds} running={timerRunning} setRunning={setTimerRunning} mode={timerMode} setMode={setTimerMode} sessions={timerSessions} setSessions={setTimerSessions} store={store} updateStore={updateStore}/>}
        </div>
      </main>

      {activeTask&&<TaskPanel task={tasks.find(t=>t.id===activeTask)} tasks={tasks} projects={projects} onClose={()=>setActiveTask(null)} onUpdate={updateTask} onComplete={completeTask} onDelete={deleteTask} onUndo={doUndo}/>}
      {showQuickAdd&&<Modal title="Create a task" onClose={()=>setShowQuickAdd(false)} wide>
        <form className="quick-form" onSubmit={e=>{e.preventDefault();addTask(quickTitle);}}>
          <input ref={quickInputRef} className="title-input" placeholder="What needs to get done?" value={quickTitle} onChange={e=>setQuickTitle(e.target.value)} autoFocus/>
          <textarea placeholder="Add a little context (optional)" value={newTaskDescription} onChange={e=>setNewTaskDescription(e.target.value)} rows={2}/>
          <div className="form-grid">
            <label>Project<select value={newTaskProject} onChange={e=>setNewTaskProject(e.target.value)}><option value="">Inbox (no project)</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Due date<input type="date" value={newTaskDate} onChange={e=>setNewTaskDate(e.target.value)}/></label>
            <label>Time<input type="time" value={newTaskTime} onChange={e=>setNewTaskTime(e.target.value)}/></label>
            <label>Priority<select value={newTaskPriority} onChange={e=>setNewTaskPriority(e.target.value)}>{['none','low','medium','high','urgent'].map(x=><option key={x}>{x}</option>)}</select></label>
            <label>Estimate (minutes)<input type="number" min="0" value={newTaskEstimate} onChange={e=>setNewTaskEstimate(e.target.value)}/></label>
            <label>Repeat<select value={newTaskRecurrence} onChange={e=>setNewTaskRecurrence(e.target.value)}>{[['none','Does not repeat'],['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
          </div>
          <label>Tags <input placeholder="e.g. study, important (comma separated)" value={newTaskTags} onChange={e=>setNewTaskTags(e.target.value)}/></label>
          <div className="modal-actions"><button type="button" className="btn secondary" onClick={()=>setShowQuickAdd(false)}>Cancel</button><button type="submit" className="btn primary"><Plus size={15}/> Create task</button></div>
        </form>
      </Modal>}
      {showCommand&&<CommandModal commands={commands} tasks={tasks} onClose={()=>setShowCommand(false)} onTask={id=>{setActiveTask(id);setShowCommand(false)}}/>}
      {showSettings&&<SettingsModal store={store} dbStatus={dbStatus} updateStore={updateStore} onClose={()=>setShowSettings(false)} onExportJSON={exportJSON} onExportCSV={exportCSV} onImport={()=>fileInputRef.current?.click()} importError={importError} onReset={()=>{if(window.confirm('Clear all tasks, projects, habits, goals, sessions, and workspace history? This also syncs the empty workspace to MySQL. Export a backup first if you want to keep anything.')){const empty=seedData();setStore(empty);setPage('myday');setActiveProject(null);setActiveTask(null);setNewTaskProject('');setToast('Workspace cleared. You can start fresh.');}}}/>}
      {showReview&&<ReviewModal tasks={tasks} onClose={()=>setShowReview(false)} setActiveTask={id=>{setActiveTask(id);setShowReview(false)}}/>}
      {showNewProject&&<Modal title="Create a project" onClose={()=>setShowNewProject(false)}><form onSubmit={e=>{e.preventDefault();createProject();}}><label>Project name<input value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="e.g. Personal growth" autoFocus/></label><div className="modal-actions"><button type="button" className="btn secondary" onClick={()=>setShowNewProject(false)}>Cancel</button><button className="btn primary" type="submit"><Plus size={15}/> Create project</button></div></form></Modal>}
      <input ref={fileInputRef} type="file" accept=".json,application/json" hidden onChange={e=>{if(e.target.files?.[0])importJSON(e.target.files[0]);e.target.value='';}}/>
      {toast&&<div className="toast"><CheckCircle2 size={16}/><span>{toast}</span>{undoSnapshot&&<button onClick={doUndo}>Undo</button>}<button className="toast-close" onClick={()=>setToast('')}><X size={14}/></button></div>}
      <button className="floating-help" title="Keyboard shortcuts" onClick={()=>setToast('⌘K command palette · ⌘N new task · / search · Esc close · ⌘Z undo')}><Keyboard size={17}/></button>
    </div>
  );
}

function NavItem({icon:Icon,label,count,active,collapsed,onClick}) {
  return <button title={label} className={`nav-item ${active?'active':''} ${collapsed?'collapsed':''}`} onClick={onClick}><Icon size={16}/>{!collapsed&&<><span>{label}</span>{count>0&&<small>{count}</small>}</>}</button>;
}
function Modal({title,children,onClose,wide=false}) {
  useEffect(()=>{const f=e=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',f);return()=>window.removeEventListener('keydown',f);},[onClose]);
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className={`modal ${wide?'modal-wide':''}`}><header className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose}><X size={17}/></button></header><div className="modal-body">{children}</div></section></div>;
}
function TaskPage({page,pageTitle,currentProject,visibleTasks,allTasks,projects,todayTasks,overdueTasks,query,setQuery,filterPriority,setFilterPriority,filterStatus,setFilterStatus,sortBy,setSortBy,showFilters,setShowFilters,startNewTask,completeTask,setActiveTask,updateTask,setShowReview,progress,openPage}) {
  const isCompleted=page==='completed';
  const isToday=page==='myday';
  return <div className="page">
    <div className="page-heading">
      <div><div className="eyebrow">{currentProject?'PROJECT / '+currentProject.name.toUpperCase():isToday?'YOUR DAILY SPACE':'WORKSPACE'}</div><h1>{pageTitle}</h1><p>{isToday?'A little progress adds up.':currentProject?'Keep the moving parts in one place.':page==='upcoming'?'A clear view of what is coming next.':page==='inbox'?'Capture now. Organize when you are ready.':page==='completed'?'A record of work you have moved forward.':'Everything you are working on, in one place.'}</p></div>
      <div className="heading-actions"><button className="btn secondary" onClick={()=>setShowReview(true)}><CalendarCheck size={15}/> Review</button><button className="btn primary" onClick={startNewTask}><Plus size={16}/> New task <kbd>⌘N</kbd></button></div>
    </div>
    {isToday&&<div className="day-summary">
      <div className="summary-main"><div className="summary-icon"><Sun size={17}/></div><div><strong>{todayTasks.length===0?'You have room to breathe.':`${todayTasks.length} task${todayTasks.length===1?'':'s'} left today`}</strong><span>{overdueTasks.length?`${overdueTasks.length} overdue item${overdueTasks.length===1?'':'s'} need attention.`:'Pick a priority and make steady progress.'}</span></div></div>
      <div className="summary-progress"><div className="progress-copy"><span>Workspace completion</span><b>{progress}%</b></div><div className="progress-track"><div style={{width:`${progress}%`}}/></div></div>
    </div>}
    <div className="task-toolbar">
      <div className="view-tabs"><button className="view-tab active"><List size={15}/> List</button><button className="view-tab" onClick={()=>openPage('board')}><Grid2X2 size={15}/> Board</button><button className="view-tab" onClick={()=>openPage('calendar')}><Calendar size={15}/> Calendar</button></div>
      <div className="toolbar-right"><div className="inline-search"><Search size={15}/><input data-search placeholder="Filter tasks..." value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button onClick={()=>setQuery('')}><X size={13}/></button>}</div><button className={`icon-btn ${showFilters?'selected':''}`} title="Filters" onClick={()=>setShowFilters(v=>!v)}><SlidersHorizontal size={16}/></button><select className="sort-select" value={sortBy} onChange={e=>setSortBy(e.target.value)} aria-label="Sort tasks"><option value="manual">Manual order</option><option value="due">Due date</option><option value="priority">Priority</option><option value="created">Recently created</option></select></div>
    </div>
    {showFilters&&<div className="filter-bar"><label>Priority<select value={filterPriority} onChange={e=>setFilterPriority(e.target.value)}><option value="all">All priorities</option>{['urgent','high','medium','low','none'].map(x=><option key={x} value={x}>{x}</option>)}</select></label><label>Status<select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}><option value="all">All statuses</option><option value="todo">To do</option><option value="inprogress">In progress</option><option value="done">Completed</option></select></label><button className="text-btn" onClick={()=>{setFilterPriority('all');setFilterStatus('all');setQuery('');}}>Reset filters</button></div>}
    <div className="task-list">
      <div className="list-section-head"><span>{isCompleted?'COMPLETED TASKS':isToday?'TODAY':page==='upcoming'?'UP NEXT':currentProject?'PROJECT TASKS':page==='inbox'?'CAPTURED':'TASKS'}</span><span>{visibleTasks.length} items</span></div>
      {visibleTasks.length===0?<div className="empty-state"><div className="empty-icon"><CheckCheck size={22}/></div><h3>{query?'No matching tasks':isToday?'A little space to think.':'Nothing here just yet.'}</h3><p>{query?'Try another search or clear your filters.':'Create a task to give your plans a place to land.'}</p>{!isCompleted&&<button className="btn secondary" onClick={startNewTask}><Plus size={15}/> Add a task</button>}</div>:visibleTasks.map(t=><TaskRow key={t.id} task={t} project={projects.find(p=>p.id===t.projectId)} onToggle={()=>completeTask(t)} onOpen={()=>setActiveTask(t.id)}/>)}
      <button className="add-task-inline" onClick={startNewTask}><Plus size={15}/> Add a task</button>
    </div>
  </div>;
}
function TaskRow({task,project,onToggle,onOpen}) {
  const overdue=task.status!=='done'&&task.dueDate&&task.dueDate<todayISO();
  const subtasks=task.subtasks||[];
  return <div className={`task-row ${task.status==='done'?'is-done':''}`} onDoubleClick={onOpen}>
    <button className={`task-check ${task.status==='done'?'checked':''}`} title={task.status==='done'?'Reopen task':'Complete task'} onClick={e=>{e.stopPropagation();onToggle();}}>{task.status==='done'&&<Check size={13}/>}</button>
    <button className="task-row-main" onClick={onOpen}><span className="task-title">{task.title}</span><span className="task-meta">{project&&<span className="meta-project"><i style={{background:project.color}}/>{project.name}</span>}{task.section&&<span>{task.section}</span>}{task.tags?.slice(0,2).map(tag=><span className="tag-chip" key={tag}>{tag}</span>)}{subtasks.length>0&&<span className="subtask-count"><CheckSquare size={12}/>{subtasks.filter(x=>x.done).length}/{subtasks.length}</span>}{task.links?.length>0&&<Paperclip size={12}/>}</span></button>
    <div className="task-row-end">{task.priority&&task.priority!=='none'&&<span className={`priority-dot ${task.priority}`} title={`${task.priority} priority`}/>}{task.estimate>0&&<span className="task-estimate"><Hourglass size={12}/>{task.estimate}m</span>}{task.dueDate&&<span className={`task-date ${overdue?'overdue':''}`}><Calendar size={12}/>{dateLabel(task.dueDate)}{task.dueTime&&` · ${task.dueTime}`}</span>}<button className="row-open" onClick={onOpen} title="Open task"><ChevronRight size={15}/></button></div>
  </div>;
}
function BoardPage({tasks,projects,completeTask,setActiveTask,updateTask,startNewTask}) {
  const cols=[['todo','To do'],['inprogress','In progress'],['done','Done']];
  return <div className="page"><div className="page-heading"><div><div className="eyebrow">PROJECT FLOW</div><h1>Board</h1><p>Move work forward, one column at a time.</p></div><button className="btn primary" onClick={startNewTask}><Plus size={15}/> New task</button></div><div className="board-columns">{cols.map(([status,label])=><div className="board-column" key={status} onDragOver={e=>e.preventDefault()} onDrop={e=>{const id=e.dataTransfer.getData('text/daymark-task');if(id)updateTask(id,{status},'Task status changed');}}><div className="board-col-head"><span className={`status-marker ${status}`}/><b>{label}</b><span className="count-pill">{tasks.filter(t=>t.status===status).length}</span><button className="tiny-icon" onClick={startNewTask}><Plus size={14}/></button></div>{tasks.filter(t=>t.status===status).map(t=><div key={t.id} className="board-card" draggable onDragStart={e=>e.dataTransfer.setData('text/daymark-task',t.id)}><div className="board-card-top"><span className="project-mini" style={{background:projectColor(t.projectId,projects)}}/>{t.priority!=='none'&&<span className={`priority-dot ${t.priority}`}/>}<button className="tiny-icon" onClick={()=>setActiveTask(t.id)}><Ellipsis size={15}/></button></div><button className="board-card-title" onClick={()=>setActiveTask(t.id)}>{t.title}</button>{t.description&&<p>{t.description}</p>}<div className="board-card-foot">{t.dueDate&&<span className="task-date"><Calendar size={11}/>{dateLabel(t.dueDate)}</span>}<button className="task-check small" onClick={()=>completeTask(t)} title="Toggle completion">{t.status==='done'?<Check size={11}/>:<Circle size={13}/>}</button></div></div>)}<button className="board-add" onClick={startNewTask}><Plus size={14}/> Add task</button></div>)}</div></div>;
}
function CalendarPage({tasks,month,setMonth,setActiveTask,startNewTask}) {
  const year=month.getFullYear(),m=month.getMonth();
  const first=new Date(year,m,1),last=new Date(year,m+1,0);
  const offset=(first.getDay()+6)%7;
  const cells=Array.from({length:Math.ceil((offset+last.getDate())/7)*7},(_,i)=>{const day=i-offset+1;return day<1||day>last.getDate()?null:`${year}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;});
  return <div className="page"><div className="page-heading"><div><div className="eyebrow">TIME & COMMITMENTS</div><h1>Calendar</h1><p>See your tasks in the context of your month.</p></div><button className="btn primary" onClick={startNewTask}><Plus size={15}/> New task</button></div><div className="calendar-card"><div className="calendar-head"><div><h2>{month.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h2><span>{tasks.filter(t=>t.dueDate?.startsWith(`${year}-${String(m+1).padStart(2,'0')}`)).length} scheduled tasks</span></div><div className="calendar-nav"><button className="icon-btn" onClick={()=>setMonth(new Date(year,m-1,1))}><ChevronLeft size={16}/></button><button className="btn secondary small-btn" onClick={()=>setMonth(new Date())}>Today</button><button className="icon-btn" onClick={()=>setMonth(new Date(year,m+1,1))}><ChevronRight size={16}/></button></div></div><div className="calendar-grid">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><div key={d} className="calendar-weekday">{d}</div>)}{cells.map((day,i)=><div key={day||`empty-${i}`} className={`calendar-cell ${day===todayISO()?'is-today':''} ${!day?'is-empty':''}`}><span className="calendar-day">{day?Number(day.slice(-2)):''}</span>{day&&tasks.filter(t=>t.dueDate===day&&t.status!=='archived').slice(0,3).map(t=><button key={t.id} className={`calendar-event ${t.status==='done'?'event-done':''}`} onClick={()=>setActiveTask(t.id)} title={t.title}><i style={{background:t.priority==='urgent'?'var(--danger)':t.priority==='high'?'var(--accent)': 'var(--muted)'}}/>{t.title}</button>)}{day&&tasks.filter(t=>t.dueDate===day&&t.status!=='archived').length>3&&<span className="more-events">+{tasks.filter(t=>t.dueDate===day&&t.status!=='archived').length-3} more</span>}</div>)}</div></div></div>;
}
function AnalyticsPage({tasks,projects,sessions,progress}) {
  const completed=tasks.filter(t=>t.status==='done');
  const open=tasks.filter(t=>t.status!=='done'&&t.status!=='archived');
  const overdue=open.filter(t=>t.dueDate&&t.dueDate<todayISO());
  const estimated=completed.reduce((s,t)=>s+(Number(t.estimate)||0),0);
  const actual=completed.reduce((s,t)=>s+(Number(t.actual)||0),0);
  const last7=Array.from({length:7},(_,i)=>{const date=addDays(todayISO(),i-6);return {date,label:new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{weekday:'short'}),count:completed.filter(t=>t.completedAt&&new Date(t.completedAt).toISOString().slice(0,10)===date).length};});
  const max=Math.max(1,...last7.map(d=>d.count));
  return <div className="page"><div className="page-heading"><div><div className="eyebrow">YOUR WORK, IN PERSPECTIVE</div><h1>Insights</h1><p>Useful signals to help you plan, not a score to chase.</p></div></div><div className="stats-grid"><StatCard label="Tasks completed" value={completed.length} note="Across your workspace" icon={CheckCircle2}/><StatCard label="Open tasks" value={open.length} note="Still in progress or planned" icon={ListChecks}/><StatCard label="Overdue" value={overdue.length} note="Worth reviewing" icon={Clock3} alert={overdue.length>0}/><StatCard label="Completion rate" value={`${progress}%`} note="Of all recorded tasks" icon={TrendingUp}/></div><div className="analytics-grid"><section className="surface-card"><div className="section-heading"><div><h2>Completion activity</h2><p>Completed tasks by day · last 7 days</p></div><Activity size={17}/></div><div className="bar-chart">{last7.map(d=><div className="bar-col" key={d.date}><span className="bar-value">{d.count||''}</span><div className="bar-rail"><div className="bar-fill" style={{height:`${Math.max(d.count?10:3,d.count/max*100)}%`}}/></div><span className="bar-label">{d.label}</span></div>)}</div></section><section className="surface-card"><div className="section-heading"><div><h2>Project progress</h2><p>Completed versus total tasks</p></div><Folder size={17}/></div><div className="project-progress-list">{projects.map(p=>{const all=tasks.filter(t=>t.projectId===p.id&&t.status!=='archived'),done=all.filter(t=>t.status==='done').length,pct=all.length?Math.round(done/all.length*100):0;return <div className="project-progress" key={p.id}><div className="project-progress-label"><span><i style={{background:p.color}}/>{p.name}</span><b>{done}/{all.length}</b></div><div className="progress-track"><div style={{width:`${pct}%`,background:p.color}}/></div></div>})}</div></section><section className="surface-card"><div className="section-heading"><div><h2>Time awareness</h2><p>Recorded estimates for completed tasks</p></div><Hourglass size={17}/></div><div className="time-compare"><div><span>Estimated</span><b>{Math.round(estimated/60*10)/10}h</b></div><div><span>Recorded</span><b>{Math.round(actual/60*10)/10}h</b></div></div><p className="subtle-note">Time insights improve as you record actual effort on task details.</p></section><section className="surface-card"><div className="section-heading"><div><h2>Focus sessions</h2><p>Completed focus blocks</p></div><Timer size={17}/></div><div className="focus-stat"><b>{sessions.length}</b><span>sessions recorded</span></div><div className="focus-stat-secondary">{sessions.reduce((s,x)=>s+(x.minutes||25),0)} minutes focused in total</div></section></div></div>;
}
function StatCard({label,value,note,icon:Icon,alert}) {return <div className="stat-card"><div className="stat-card-top"><span>{label}</span><Icon size={17}/></div><strong className={alert?'danger-text':''}>{value}</strong><small>{note}</small></div>;}
function HabitsGoalsPage({page,store,updateStore,habitName,setHabitName,goalName,setGoalName,goalTarget,setGoalTarget}) {
  const today=todayISO();
  const addHabit=()=>{if(!habitName.trim())return;updateStore(s=>({...s,habits:[...s.habits,{id:uid(),name:habitName.trim(),frequency:'daily',logs:{}}]}));setHabitName('');};
  const toggleHabit=h=>updateStore(s=>({...s,habits:s.habits.map(x=>x.id===h.id?{...x,logs:{...x.logs,[today]:!x.logs?.[today]}}:x)}));
  const addGoal=()=>{if(!goalName.trim())return;updateStore(s=>({...s,goals:[...s.goals,{id:uid(),title:goalName.trim(),target:Number(goalTarget)||1,current:0,unit:'steps',dueDate:addDays(today,30)}]}));setGoalName('');};
  return <div className="page"><div className="page-heading"><div><div className="eyebrow">SMALL ACTIONS, LONGER ARCS</div><h1>Habits & goals</h1><p>Keep repeatable routines and bigger outcomes visible.</p></div></div><div className="two-col"><section className="surface-card"><div className="section-heading"><div><h2>Daily habits</h2><p>Mark the things you showed up for.</p></div><Repeat2 size={17}/></div><form className="inline-create" onSubmit={e=>{e.preventDefault();addHabit();}}><input value={habitName} onChange={e=>setHabitName(e.target.value)} placeholder="Add a habit..."/><button className="btn primary" type="submit"><Plus size={14}/></button></form>{store.habits.map(h=>{const days=Object.values(h.logs||{}).filter(Boolean).length;return <div className="habit-row" key={h.id}><button className={`task-check ${h.logs?.[today]?'checked':''}`} onClick={()=>toggleHabit(h)}>{h.logs?.[today]&&<Check size={13}/>}</button><div className="habit-copy"><b>{h.name}</b><span>{h.logs?.[today]?'Done today':'Daily habit'} · {days} logged days</span></div><button className="tiny-icon" title="Delete habit" onClick={()=>{if(confirm('Delete this habit?'))updateStore(s=>({...s,habits:s.habits.filter(x=>x.id!==h.id)}));}}><Trash2 size={14}/></button></div>})}{store.habits.length===0&&<p className="empty-inline">Add a habit to start tracking consistency.</p>}</section><section className="surface-card"><div className="section-heading"><div><h2>Goals & milestones</h2><p>Make long-term outcomes concrete.</p></div><Target size={17}/></div><form className="inline-create" onSubmit={e=>{e.preventDefault();addGoal();}}><input value={goalName} onChange={e=>setGoalName(e.target.value)} placeholder="Add a goal..."/><input className="target-input" type="number" min="1" value={goalTarget} onChange={e=>setGoalTarget(e.target.value)} aria-label="Goal target"/><button className="btn primary" type="submit"><Plus size={14}/></button></form>{store.goals.map(g=><div className="goal-row" key={g.id}><div className="goal-top"><b>{g.title}</b><button className="tiny-icon" title="Delete goal" onClick={()=>{if(confirm('Delete this goal?'))updateStore(s=>({...s,goals:s.goals.filter(x=>x.id!==g.id)}));}}><Trash2 size={14}/></button></div><div className="goal-progress"><div className="progress-track"><div style={{width:`${Math.min(100,g.current/g.target*100)}%`}}/></div><span>{g.current} / {g.target} {g.unit}</span></div><div className="goal-actions"><button className="text-btn" onClick={()=>updateStore(s=>({...s,goals:s.goals.map(x=>x.id===g.id?{...x,current:Math.max(0,x.current-1)}:x)}))}>− One</button><button className="text-btn" onClick={()=>updateStore(s=>({...s,goals:s.goals.map(x=>x.id===g.id?{...x,current:Math.min(x.target,x.current+1)}:x)}))}>+ One</button><span>Due {dateLabel(g.dueDate)}</span></div></div>)}{store.goals.length===0&&<p className="empty-inline">Add a measurable goal to track progress.</p>}</section></div></div>;
}
function FocusPage({seconds,setSeconds,running,setRunning,mode,setMode,sessions,setSessions,store,updateStore}) {
  const fmt=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const reset=next=>{setRunning(false);setMode(next);setSeconds(next==='focus'?25*60:5*60);};
  const circumference=2*Math.PI*82;
  const total=mode==='focus'?25*60:5*60;
  return <div className="page"><div className="page-heading"><div><div className="eyebrow">PROTECT A LITTLE TIME</div><h1>Focus timer</h1><p>One thing at a time is enough.</p></div></div><div className="focus-layout"><section className="surface-card timer-card"><div className="timer-modes"><button className={mode==='focus'?'active':''} onClick={()=>reset('focus')}>Focus · 25 min</button><button className={mode==='break'?'active':''} onClick={()=>reset('break')}>Short break · 5 min</button></div><div className="timer-ring"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="82" className="timer-track"/><circle cx="100" cy="100" r="82" className="timer-progress" style={{strokeDasharray:circumference,strokeDashoffset:circumference*(1-seconds/total)}}/></svg><div className="timer-time"><strong>{fmt(seconds)}</strong><span>{running?'STAY WITH IT':mode==='focus'?'READY TO FOCUS':'TAKE A BREATH'}</span></div></div><div className="timer-controls"><button className="btn primary timer-start" onClick={()=>setRunning(v=>!v)}>{running?'Pause':'Start focus'}</button><button className="icon-btn" onClick={()=>{setRunning(false);setSeconds(total);}} title="Reset timer"><RotateCcw size={17}/></button><button className="icon-btn" onClick={()=>{const n=mode==='focus'?'break':'focus';reset(n);}} title="Switch timer mode"><ArrowRight size={17}/></button></div><p className="subtle-note">Keep this tab open while a session runs. Browser notifications are optional and may depend on permissions.</p></section><section className="surface-card focus-side"><div className="section-heading"><div><h2>Focus history</h2><p>Sessions saved in this workspace</p></div><History size={17}/></div><div className="focus-stat"><b>{store.sessions.length}</b><span>completed sessions</span></div><div className="focus-stat-secondary">{store.sessions.reduce((s,x)=>s+(x.minutes||25),0)} minutes of focused time</div><div className="session-list">{store.sessions.slice(-6).reverse().map(s=><div className="session-row" key={s.id}><span><CheckCircle2 size={14}/>{dateLabel(s.date)}</span><b>{s.minutes||25} min</b></div>)}</div></section></div></div>;
}
function TaskPanel({task,tasks,projects,onClose,onUpdate,onComplete,onDelete}) {
  const [tab,setTab]=useState('details');
  const [subtaskTitle,setSubtaskTitle]=useState('');
  const [linkValue,setLinkValue]=useState('');
  const [depValue,setDepValue]=useState('');
  const [actual,setActual]=useState(String(task?.actual||0));
  const [newTag,setNewTag]=useState('');
  if(!task)return null;
  const project=projects.find(p=>p.id===task.projectId);
  const patch=(p,label)=>onUpdate(task.id,p,label);
  const addSubtask=()=>{if(!subtaskTitle.trim())return;patch({subtasks:[...(task.subtasks||[]),{id:uid(),title:subtaskTitle.trim(),done:false}]},'Subtask added');setSubtaskTitle('');};
  const addLink=()=>{if(!linkValue.trim())return;patch({links:[...(task.links||[]),{id:uid(),url:linkValue.trim()}]},'Link added');setLinkValue('');};
  const addTag=()=>{if(!newTag.trim())return;patch({tags:[...new Set([...(task.tags||[]),newTag.trim()])]},'Tag added');setNewTag('');};
  const addDependency=()=>{if(!depValue||depValue===task.id)return;patch({dependencies:[...new Set([...(task.dependencies||[]),depValue])]},'Dependency added');setDepValue('');};
  const history=task.history||[];
  return <div className="panel-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><aside className="task-panel"><header className="panel-head"><div className="panel-breadcrumb"><span>{project?.name||'Inbox'}</span><ChevronRight size={13}/><span>Task details</span></div><div className="panel-actions"><button className="icon-btn" title="Complete task" onClick={()=>onComplete(task)}><CheckCircle2 size={17}/></button><button className="icon-btn" onClick={onClose}><X size={17}/></button></div></header><div className="panel-scroll"><div className="task-status-line"><span className={`status-marker ${task.status}`}/><select value={task.status} onChange={e=>patch({status:e.target.value,completedAt:e.target.value==='done'?Date.now():null},'Task status changed')}><option value="todo">To do</option><option value="inprogress">In progress</option><option value="done">Completed</option><option value="archived">Archived</option></select><span className="panel-id">DM-{task.id.slice(-5).toUpperCase()}</span></div><textarea className="panel-title" value={task.title} onChange={e=>patch({title:e.target.value},'Task title changed')} rows={2}/><textarea className="panel-description" value={task.description||''} onChange={e=>patch({description:e.target.value},'Task description changed')} placeholder="Add a description..." rows={4}/><div className="panel-tabs"><button className={tab==='details'?'active':''} onClick={()=>setTab('details')}>Details</button><button className={tab==='subtasks'?'active':''} onClick={()=>setTab('subtasks')}>Subtasks <span>{task.subtasks?.length||0}</span></button><button className={tab==='activity'?'active':''} onClick={()=>setTab('activity')}>Activity</button></div>
    {tab==='details'&&<div className="panel-fields">
      <Field label="Project" icon={Folder}><select value={task.projectId||''} onChange={e=>patch({projectId:e.target.value},'Project changed')}><option value="">Inbox</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="Due date" icon={Calendar}><input type="date" value={task.dueDate||''} onChange={e=>patch({dueDate:e.target.value},'Due date changed')}/></Field>
      <Field label="Time" icon={Clock3}><input type="time" value={task.dueTime||''} onChange={e=>patch({dueTime:e.target.value},'Due time changed')}/></Field>
      <Field label="Priority" icon={Flag}><select value={task.priority||'none'} onChange={e=>patch({priority:e.target.value},'Priority changed')}>{['none','low','medium','high','urgent'].map(x=><option key={x} value={x}>{x[0].toUpperCase()+x.slice(1)}</option>)}</select></Field>
      <Field label="Repeat" icon={Repeat2}><select value={task.recurrence||'none'} onChange={e=>patch({recurrence:e.target.value},'Recurrence changed')}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></Field>
      <Field label="Estimate (min)" icon={Hourglass}><input type="number" min="0" value={task.estimate||0} onChange={e=>patch({estimate:Number(e.target.value)},'Estimate changed')}/></Field>
      <Field label="Actual time (min)" icon={Timer}><input type="number" min="0" value={actual} onChange={e=>setActual(e.target.value)} onBlur={()=>patch({actual:Number(actual)||0},'Actual time updated')}/></Field>
      <Field label="Section" icon={FolderOpen}><input value={task.section||''} placeholder="e.g. Planning" onChange={e=>patch({section:e.target.value},'Section changed')}/></Field>
      <div className="panel-field full-field"><label><Tag size={14}/> Tags</label><div className="tag-list">{(task.tags||[]).map(tag=><span className="tag-chip" key={tag}>{tag}<button onClick={()=>patch({tags:task.tags.filter(x=>x!==tag)},'Tag removed')}><X size={10}/></button></span>)}</div><form className="mini-add" onSubmit={e=>{e.preventDefault();addTag();}}><input value={newTag} onChange={e=>setNewTag(e.target.value)} placeholder="Add a tag"/><button className="icon-btn"><Plus size={14}/></button></form></div>
      <div className="panel-field full-field"><label><Link2 size={14}/> Links</label>{(task.links||[]).map(link=><div className="link-row" key={link.id}><a href={link.url} target="_blank" rel="noreferrer">{link.url}<ExternalLink size={12}/></a><button className="tiny-icon" onClick={()=>patch({links:task.links.filter(x=>x.id!==link.id)},'Link removed')}><X size={13}/></button></div>)}<form className="mini-add" onSubmit={e=>{e.preventDefault();addLink();}}><input value={linkValue} onChange={e=>setLinkValue(e.target.value)} placeholder="https://..."/><button className="icon-btn"><Plus size={14}/></button></form></div>
      <div className="panel-field full-field"><label><ArrowDownUp size={14}/> Dependencies</label>{(task.dependencies||[]).map(id=>{const dep=tasks.find(t=>t.id===id);return dep?<div className="dependency-row" key={id}><CircleDot size={13}/><span>{dep.title}</span><button className="tiny-icon" onClick={()=>patch({dependencies:task.dependencies.filter(x=>x!==id)},'Dependency removed')}><X size={13}/></button></div>:null})}<select value={depValue} onChange={e=>setDepValue(e.target.value)}><option value="">Add blocked-by task...</option>{tasks.filter(t=>t.id!==task.id&&!(task.dependencies||[]).includes(t.id)).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select><button className="btn secondary full-btn" onClick={addDependency} disabled={!depValue}>Add dependency</button></div>
    </div>}
    {tab==='subtasks'&&<div className="subtasks-panel"><div className="subtask-progress"><div className="progress-track"><div style={{width:`${task.subtasks?.length?task.subtasks.filter(s=>s.done).length/task.subtasks.length*100:0}%`}}/></div><span>{task.subtasks?.filter(s=>s.done).length||0} of {task.subtasks?.length||0} complete</span></div>{(task.subtasks||[]).map(s=><div className="subtask-row" key={s.id}><button className={`task-check ${s.done?'checked':''}`} onClick={()=>patch({subtasks:task.subtasks.map(x=>x.id===s.id?{...x,done:!x.done}:x)},'Subtask updated')}>{s.done&&<Check size={12}/>}</button><input value={s.title} className={s.done?'strike':''} onChange={e=>patch({subtasks:task.subtasks.map(x=>x.id===s.id?{...x,title:e.target.value}:x)},'Subtask edited')}/><button className="tiny-icon" onClick={()=>patch({subtasks:task.subtasks.filter(x=>x.id!==s.id)},'Subtask removed')}><Trash2 size={13}/></button></div>)}<form className="mini-add" onSubmit={e=>{e.preventDefault();addSubtask();}}><input value={subtaskTitle} onChange={e=>setSubtaskTitle(e.target.value)} placeholder="Add a subtask..."/><button className="icon-btn"><Plus size={14}/></button></form></div>}
    {tab==='activity'&&<div className="activity-list"><div className="activity-item"><span className="activity-dot"/><div><b>Created</b><small>{new Date(task.createdAt||Date.now()).toLocaleString()}</small></div></div>{history.slice().reverse().map((h,i)=><div className="activity-item" key={i}><span className="activity-dot"/><div><b>{h.label}</b><small>{new Date(h.at).toLocaleString()}</small></div></div>)}{task.completedAt&&<div className="activity-item"><span className="activity-dot green"/><div><b>Completed</b><small>{new Date(task.completedAt).toLocaleString()}</small></div></div>}</div>}
    <div className="panel-footer"><button className="btn danger-ghost" onClick={()=>onDelete(task.id)}><Trash2 size={14}/> Delete task</button><span>Created {new Date(task.createdAt||Date.now()).toLocaleDateString()}</span></div>
  </div></aside></div>;
}
function Field({label,icon:Icon,children}) {return <div className="panel-field"><label><Icon size={14}/>{label}</label>{children}</div>;}
function CommandModal({commands,tasks,onClose,onTask}) {
  const [q,setQ]=useState('');const input=useRef(null);
  useEffect(()=>{input.current?.focus();},[]);
  const items=[...commands.map(c=>({...c,type:'command'})),...tasks.filter(t=>t.title.toLowerCase().includes(q.toLowerCase())).slice(0,5).map(t=>({label:t.title,hint:'Task',icon:CheckSquare,type:'task',task:t}))].filter(c=>c.label.toLowerCase().includes(q.toLowerCase()));
  return <div className="modal-backdrop command-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="command-modal"><div className="command-search"><Search size={18}/><input ref={input} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search tasks or run a command..."/><kbd>ESC</kbd></div><div className="command-results"><div className="command-caption">{q?'RESULTS':'SUGGESTED ACTIONS'}</div>{items.length===0?<p className="empty-inline">No matching commands or tasks.</p>:items.map((c,i)=><button className="command-result" key={`${c.label}-${i}`} onClick={()=>{if(c.type==='task')onTask(c.task.id);else{onClose();c.action();}}}><c.icon size={16}/><span>{c.label}</span><small>{c.hint||''}</small></button>)}</div><footer><span><kbd>↵</kbd> Open</span><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>ESC</kbd> Close</span></footer></section></div>;
}
function SettingsModal({store,dbStatus,updateStore,onClose,onExportJSON,onExportCSV,onImport,importError,onReset}) {
  const [tab,setTab] = useState('preferences');
  const update=(key,val)=>updateStore(s=>({...s,settings:{...s.settings,[key]:val}}));
  const tabs = [
    {id:'preferences',label:'Preferences',icon:SlidersHorizontal},
    {id:'backups',label:'Data & backups',icon:Download},
    {id:'shortcuts',label:'Shortcuts',icon:Keyboard}
  ];
  return <Modal title="Settings" onClose={onClose} wide><div className="settings-layout"><nav className="settings-nav" aria-label="Settings sections">{tabs.map(item=><button type="button" key={item.id} className={tab===item.id?'settings-nav-active':''} aria-current={tab===item.id?'page':undefined} onClick={()=>setTab(item.id)}><item.icon size={15}/>{item.label}</button>)}</nav><div className="settings-content">
    {tab==='preferences'&&<><h3>Preferences</h3><p className="settings-desc">Shape Daymark around how you like to work.</p><div className="setting-row"><div><b>Appearance</b><small>Choose your preferred theme.</small></div><select value={store.settings.theme} onChange={e=>update('theme',e.target.value)}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></div><div className="setting-row"><div><b>Week starts on</b><small>Used in calendar planning.</small></div><select value={store.settings.weekStart} onChange={e=>update('weekStart',e.target.value)}><option value="monday">Monday</option><option value="sunday">Sunday</option></select></div><div className="setting-row"><div><b>Compact density</b><small>Reduce row spacing in task lists.</small></div><button type="button" aria-label="Toggle compact density" aria-pressed={!!store.settings.compact} className={`toggle ${store.settings.compact?'on':''}`} onClick={()=>update('compact',!store.settings.compact)}><i/></button></div><div className="setting-row"><div><b>Browser notifications</b><small>Allow reminders while Daymark is open.</small></div><button type="button" aria-label="Toggle browser notifications" aria-pressed={!!store.settings.notifications} className={`toggle ${store.settings.notifications?'on':''}`} onClick={async()=>{if(!store.settings.notifications&&'Notification'in window){const p=await Notification.requestPermission();update('notifications',p==='granted');}else update('notifications',false);}}><i/></button></div></>}
    {tab==='backups'&&<><h3>Data & backups</h3><p className="settings-desc">Keep a portable copy of your workspace. Backups include tasks, projects, habits, goals, sessions, preferences, and history.</p><div className="setting-row"><div><b>Storage status</b><small>{dbStatus==='connected'?'Your workspace is syncing with your local MySQL database.':dbStatus==='connecting'?'Checking the database connection…':'Changes are currently stored in this browser.'}</small></div><span className={`storage-pill ${dbStatus==='connected'?'is-connected':''}`}>{dbStatus==='connected'?'MySQL connected':dbStatus==='connecting'?'Connecting':'Browser storage'}</span></div><div className="backup-actions"><button type="button" className="btn secondary" onClick={onExportJSON}><Download size={15}/> Export full backup</button><button type="button" className="btn secondary" onClick={onExportCSV}><Download size={15}/> Export tasks CSV</button><button type="button" className="btn secondary" onClick={onImport}><FileUp size={15}/> Restore backup</button></div>{importError&&<p className="error-note" role="alert">{importError}</p>}<div className="settings-divider"/><h3>Start fresh</h3><p className="settings-desc">Remove all workspace records and keep the app ready for your own tasks.</p><button type="button" className="btn danger-ghost" onClick={onReset}><RotateCcw size={14}/> Clear workspace data</button><p className="subtle-note">This cannot be undone unless you exported a backup first.</p></>}
    {tab==='shortcuts'&&<><h3>Keyboard shortcuts</h3><p className="settings-desc">Use these shortcuts anywhere in DAYMARK unless you're typing in a field.</p><div className="shortcut-row"><span>Open command palette</span><kbd>⌘ K</kbd></div><div className="shortcut-row"><span>Create a new task</span><kbd>⌘ N</kbd></div><div className="shortcut-row"><span>Focus search</span><kbd>/</kbd></div><div className="shortcut-row"><span>Close panel or dialog</span><kbd>Esc</kbd></div><div className="shortcut-row"><span>Undo last supported change</span><kbd>⌘ Z</kbd></div><div className="settings-divider"/><p className="settings-desc">Tip: use the command palette to jump to common areas and create tasks quickly.</p><button type="button" className="btn secondary" onClick={()=>{onClose();window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true}));}}><Keyboard size={15}/> Try command palette</button></>}
  </div></div><div className="modal-actions"><button className="btn primary" onClick={onClose}><Check size={15}/> Done</button></div></Modal>;
}
function ReviewModal({tasks,onClose,setActiveTask}) {
  const completed=tasks.filter(t=>t.status==='done'&&t.completedAt&&Date.now()-t.completedAt<7*86400000);
  const overdue=tasks.filter(t=>t.status!=='done'&&t.dueDate&&t.dueDate<todayISO());
  const upcoming=tasks.filter(t=>t.status!=='done'&&t.dueDate&&t.dueDate>=todayISO()&&t.dueDate<=addDays(todayISO(),7));
  return <Modal title="Weekly review" onClose={onClose} wide><div className="review-intro"><div className="review-icon"><CalendarCheck size={22}/></div><div><h3>Make space to reset.</h3><p>A quick look at what moved, what is stuck, and what comes next.</p></div></div><div className="review-stats"><div><b>{completed.length}</b><span>Completed this week</span></div><div><b>{overdue.length}</b><span>Overdue tasks</span></div><div><b>{upcoming.length}</b><span>Due in the next 7 days</span></div></div><div className="review-section"><h3>Needs a decision</h3>{overdue.length?overdue.map(t=><button className="review-task" key={t.id} onClick={()=>setActiveTask(t.id)}><span className="priority-dot high"/><span>{t.title}</span><small>Overdue · {dateLabel(t.dueDate)}</small><ChevronRight size={14}/></button>):<p className="empty-inline">No overdue tasks. That's a good place to start.</p>}</div><div className="review-section"><h3>Coming up</h3>{upcoming.slice(0,8).map(t=><button className="review-task" key={t.id} onClick={()=>setActiveTask(t.id)}><span className="priority-dot medium"/><span>{t.title}</span><small>{dateLabel(t.dueDate)}</small><ChevronRight size={14}/></button>)}{upcoming.length===0&&<p className="empty-inline">Nothing scheduled for the coming week yet.</p>}</div><div className="modal-actions"><button className="btn primary" onClick={onClose}>Finish review</button></div></Modal>;
}

export default App;
