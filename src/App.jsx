import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  Cloud,
  Download,
  FolderOpen,
  House,
  LoaderCircle,
  Menu,
  Layers3,
  Moon,
  Pencil,
  Save,
  Settings2,
  Sun,
  Trash2,
  X,
} from 'lucide-react'
import Canvas from './components/Canvas.jsx'
import CanvasPanel from './components/CanvasPanel.jsx'
import CanvasSettings from './components/CanvasSettings.jsx'
import HeroPage from './components/HeroPage.jsx'
import ProjectsPage from './components/ProjectsPage.jsx'
import Toolbar from './components/Toolbar.jsx'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  DEFAULT_ARTWORK_TITLE,
  PROJECTS_STORAGE_KEY,
  STORAGE_KEY,
  TITLE_STORAGE_KEY,
} from './constants.js'

function readSavedProject() {
  let saved = null
  let storedTitle = null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) saved = JSON.parse(raw)
  } catch {}
  try {
    storedTitle = localStorage.getItem(TITLE_STORAGE_KEY)
  } catch {}

  const candidate = saved?.version === 2 ? saved.project : null
  const projectSizeIsValid = Number.isInteger(candidate?.width)
    && Number.isInteger(candidate?.height)
    && candidate.width >= 64
    && candidate.height >= 64
    && candidate.width <= 3000
    && candidate.height <= 3000
    && candidate.width * candidate.height <= 3_000_000
  const project = projectSizeIsValid
    && Array.isArray(candidate.layers)
    && candidate.layers.length > 0
    && candidate.layers.length <= 24
    ? candidate
    : null
  return {
    project,
    dataUrl: saved?.version === 1 && typeof saved.dataUrl === 'string' ? saved.dataUrl : null,
    width: Number.isInteger(project?.width) ? project.width : CANVAS_WIDTH,
    height: Number.isInteger(project?.height) ? project.height : CANVAS_HEIGHT,
    transparent: project?.transparent === true,
    title: (storedTitle || (typeof saved?.title === 'string' ? saved.title : DEFAULT_ARTWORK_TITLE)).slice(0, 80),
    projectId: typeof saved?.projectId === 'string' ? saved.projectId : null,
  }
}

function readSavedProjects() {
  try {
    const stored = JSON.parse(localStorage.getItem(PROJECTS_STORAGE_KEY) || 'null')
    if (stored?.version !== 1 || !Array.isArray(stored.projects)) return []
    return stored.projects.filter((item) => {
      const project = item?.project
      return typeof item?.id === 'string'
        && typeof item.title === 'string'
        && Number.isFinite(item.savedAt)
        && Number.isInteger(project?.width)
        && Number.isInteger(project?.height)
        && project.width >= 64
        && project.height >= 64
        && project.width <= 3000
        && project.height <= 3000
        && project.width * project.height <= 3_000_000
        && Array.isArray(project.layers)
        && project.layers.length > 0
        && project.layers.length <= 24
        && project.layers.every((layer) => typeof layer?.dataUrl === 'string' && layer.dataUrl.startsWith('data:image/'))
    })
  } catch {
    return []
  }
}

function dataUrlToBlob(dataUrl) {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl)
  if (!match) return null
  const binary = window.atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: match[1] })
}

function isAppleMobileBrowser() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function createPreview(dataUrl) {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const preview = document.createElement('canvas')
      const scale = Math.min(1, 360 / image.width, 240 / image.height)
      preview.width = Math.max(1, Math.round(image.width * scale))
      preview.height = Math.max(1, Math.round(image.height * scale))
      try {
        const context = preview.getContext('2d')
        if (!context) return resolve('')
        context.drawImage(image, 0, 0, preview.width, preview.height)
        resolve(preview.toDataURL('image/jpeg', 0.78))
      } catch {
        resolve('')
      }
    }
    image.onerror = () => resolve('')
    image.src = dataUrl
  })
}

function createProjectId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `project-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function formatSavedTime(date) {
  if (!date) return 'Changes save automatically'
  return `Saved ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)}`
}

async function decodeClipboardImage(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob)
    } catch {
      // Fall back to an image element for formats unsupported by createImageBitmap.
    }
  }

  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(imageUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl)
      reject(new Error('Clipboard image could not be decoded'))
    }
    image.src = imageUrl
  })
}

export default function App() {
  const canvasRef = useRef(null)
  const titleInputRef = useRef(null)
  const settingsPopoverRef = useRef(null)
  const saveRevisionRef = useRef(0)
  const skipSaveRevisionRef = useRef(null)
  const [savedProject] = useState(readSavedProject)
  const [canvasSource, setCanvasSource] = useState(() => ({ artwork: savedProject.dataUrl, project: savedProject.project }))
  const initialArtwork = canvasSource.artwork
  const initialProject = canvasSource.project
  const [canvasMountKey, setCanvasMountKey] = useState(0)
  const [page, setPage] = useState(() => {
    const path = window.location.pathname.replace(/\/+$/, '') || '/'
    return path === '/projects' ? 'projects' : path === '/canvas' ? 'editor' : 'home'
  })
  const pageRef = useRef(page)
  pageRef.current = page
  const [projects, setProjects] = useState(readSavedProjects)
  const projectsRef = useRef(projects)
  projectsRef.current = projects
  const [currentProjectId, setCurrentProjectId] = useState(() => (
    projects.some((project) => project.id === savedProject.projectId) ? savedProject.projectId : null
  ))
  const currentProjectIdRef = useRef(currentProjectId)
  currentProjectIdRef.current = currentProjectId
  const projectSaveTokenRef = useRef(0)
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('canvas-paint-studio:theme:v2') === 'light' ? 'light' : 'dark'
    } catch {
      return 'light'
    }
  })
  const [tool, setTool] = useState('brush')
  const [color, setColor] = useState('#4f46e5')
  const [brushSize, setBrushSize] = useState(8)
  const [canvasSize, setCanvasSize] = useState({ width: savedProject.width, height: savedProject.height })
  const [transparent, setTransparent] = useState(savedProject.transparent)
  const [artworkName, setArtworkName] = useState(savedProject.title)
  const artworkNameRef = useRef(artworkName)
  artworkNameRef.current = artworkName
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileLayersOpen, setMobileLayersOpen] = useState(false)
  const [titleDraft, setTitleDraft] = useState(savedProject.title)
  const [hasPendingPaste, setHasPendingPaste] = useState(false)
  const [saveStatus, setSaveStatus] = useState('ready')
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [saveRevision, setSaveRevision] = useState(0)
  const [canvasReady, setCanvasReady] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [layers, setLayers] = useState(() => initialProject?.layers?.map(({ id, name, visible }) => ({ id, name, visible })) ?? [{ id: 'layer-1', name: 'Layer 1', visible: true }])
  const [activeLayerId, setActiveLayerId] = useState(initialProject?.activeLayerId ?? 'layer-1')
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState(null)
  const [hasArtwork, setHasArtwork] = useState(Boolean(initialArtwork || initialProject))

  const navigateToPage = useCallback((nextPage) => {
    const nextPath = nextPage === 'projects' ? '/projects' : nextPage === 'editor' ? '/canvas' : '/'
    if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath)
    pageRef.current = nextPage
    setPage(nextPage)
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.replace(/\/+$/, '') || '/'
      const nextPage = path === '/projects' ? 'projects' : path === '/canvas' ? 'editor' : 'home'
      if (nextPage !== 'editor' && pageRef.current === 'editor') {
        const project = persistCurrentDraft()
        if (project) setCanvasSource({ artwork: null, project })
        setCanvasReady(false)
        setSaveRevision(0)
        saveRevisionRef.current = 0
      }
      pageRef.current = nextPage
      setPage(nextPage)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    document.documentElement.style.colorScheme = theme
    try {
      localStorage.setItem('canvas-paint-studio:theme:v2', theme)
    } catch {
      // Theme still works for this session when storage is unavailable.
    }
  }, [theme])

  useEffect(() => {
    if (!settingsOpen) return undefined
    const closeOnOutsidePointer = (event) => {
      if (!settingsPopoverRef.current?.contains(event.target)) setSettingsOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSettingsOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [settingsOpen])

  useEffect(() => {
    if (!mobileMenuOpen) return undefined
    const closeOnOutsidePointer = (event) => {
      if (!event.target.closest?.('.mobile-header-menu, .mobile-menu-trigger')) setMobileMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [mobileMenuOpen])

  const handleContentChange = useCallback(() => {
    setHasArtwork(true)
    setSaveStatus('saving')
    const nextRevision = saveRevisionRef.current + 1
    saveRevisionRef.current = nextRevision
    setSaveRevision(nextRevision)
  }, [])

  const handleHistoryChange = useCallback(({ canUndo: undo, canRedo: redo }) => {
    setCanUndo(undo)
    setCanRedo(redo)
  }, [])

  const handleLayersChange = useCallback(({ layers: nextLayers, activeLayerId: nextActiveId }) => {
    setLayers(nextLayers)
    setActiveLayerId(nextActiveId)
  }, [])

  const persistProjectRecord = useCallback((record) => {
    const nextProjects = [record, ...projectsRef.current.filter((project) => project.id !== record.id)]
      .sort((first, second) => second.savedAt - first.savedAt)
    try {
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify({ version: 1, projects: nextProjects }))
      projectsRef.current = nextProjects
      setProjects(nextProjects)
      return true
    } catch {
      setSaveStatus('error')
      return false
    }
  }, [])

  const handleSaveProject = async () => {
    const project = canvasRef.current?.getProject()
    const artwork = canvasRef.current?.getDataUrl()
    if (!project || !artwork) return
    setSaveStatus('saving')
    const saveToken = ++projectSaveTokenRef.current
    const id = currentProjectIdRef.current || createProjectId()
    const savedAt = Date.now()
    const preview = await createPreview(artwork)
    const record = { id, title: artworkNameRef.current, savedAt, preview, project }
    if (!persistProjectRecord(record)) return
    let draftSaved = true
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, project, title: record.title, projectId: id, savedAt }))
      localStorage.setItem(TITLE_STORAGE_KEY, record.title)
    } catch {
      draftSaved = false
    }
    if (projectSaveTokenRef.current === saveToken && pageRef.current === 'editor') {
      setCurrentProjectId(id)
      currentProjectIdRef.current = id
      setLastSavedAt(new Date(savedAt))
      setSaveStatus(draftSaved ? 'saved' : 'error')
    }
  }

  const persistCurrentDraft = () => {
    const project = canvasRef.current?.getProject()
    if (!project) return null
    try {
      const savedAt = Date.now()
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 2,
        project,
        title: artworkNameRef.current,
        projectId: currentProjectIdRef.current,
        savedAt,
      }))
      localStorage.setItem(TITLE_STORAGE_KEY, artworkNameRef.current)
      const projectId = currentProjectIdRef.current
      if (projectId) {
        const existing = projectsRef.current.find((item) => item.id === projectId)
        persistProjectRecord({ id: projectId, title: artworkNameRef.current, savedAt, preview: existing?.preview || '', project })
      }
      return project
    } catch {
      setSaveStatus('error')
      return null
    }
  }

  const handleShowProjects = () => {
    setMobileMenuOpen(false)
    projectSaveTokenRef.current += 1
    pageRef.current = 'projects'
    const project = persistCurrentDraft()
    if (project) setCanvasSource({ artwork: null, project })
    setCanvasReady(false)
    setSaveRevision(0)
    saveRevisionRef.current = 0
    navigateToPage('projects')
  }

  const handleGoHome = () => {
    setMobileMenuOpen(false)
    if (pageRef.current === 'editor') {
      projectSaveTokenRef.current += 1
      const project = persistCurrentDraft()
      if (project) setCanvasSource({ artwork: null, project })
      setCanvasReady(false)
      setSaveRevision(0)
      saveRevisionRef.current = 0
    }
    navigateToPage('home')
  }

  const handleBackToEditor = () => {
    navigateToPage('editor')
  }

  const handleOpenProject = (record) => {
    projectSaveTokenRef.current += 1
    pageRef.current = 'editor'
    persistCurrentDraft()
    setCurrentProjectId(record.id)
    currentProjectIdRef.current = record.id
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, project: record.project, title: record.title, projectId: record.id, savedAt: record.savedAt }))
      localStorage.setItem(TITLE_STORAGE_KEY, record.title)
    } catch {
      setSaveStatus('error')
    }
    setCanvasSource({ artwork: null, project: record.project })
    setCanvasSize({ width: record.project.width, height: record.project.height })
    setTransparent(record.project.transparent === true)
    setArtworkName(record.title)
    artworkNameRef.current = record.title
    setTitleDraft(record.title)
    setLayers(record.project.layers.map(({ id, name, visible }) => ({ id, name, visible })))
    setActiveLayerId(record.project.activeLayerId ?? record.project.layers.at(-1)?.id ?? 'layer-1')
    setHasArtwork(true)
    setLastSavedAt(new Date(record.savedAt))
    setSaveStatus('saved')
    setCanvasReady(false)
    setCanvasMountKey((key) => key + 1)
    setSaveRevision(0)
    saveRevisionRef.current = 0
    navigateToPage('editor')
  }

  const handleNewProject = () => {
    projectSaveTokenRef.current += 1
    pageRef.current = 'editor'
    persistCurrentDraft()
    setCurrentProjectId(null)
    currentProjectIdRef.current = null
    setCanvasSource({ artwork: null, project: null })
    setCanvasSize({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT })
    setTransparent(false)
    setArtworkName(DEFAULT_ARTWORK_TITLE)
    artworkNameRef.current = DEFAULT_ARTWORK_TITLE
    setTitleDraft(DEFAULT_ARTWORK_TITLE)
    setLayers([{ id: 'layer-1', name: 'Layer 1', visible: true }])
    setActiveLayerId('layer-1')
    setHasArtwork(false)
    setLastSavedAt(null)
    setSaveStatus('ready')
    setCanvasReady(false)
    setSaveRevision(0)
    saveRevisionRef.current = 0
    skipSaveRevisionRef.current = null
    setCanvasMountKey((key) => key + 1)
    navigateToPage('editor')
  }

  const confirmDeleteProject = () => {
    if (!projectToDelete) return
    const deletedId = projectToDelete.id
    const nextProjects = projectsRef.current.filter((project) => project.id !== deletedId)
    try {
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify({ version: 1, projects: nextProjects }))
      projectsRef.current = nextProjects
      setProjects(nextProjects)
      if (currentProjectIdRef.current === deletedId) {
        currentProjectIdRef.current = null
        setCurrentProjectId(null)
        try {
          const rawDraft = localStorage.getItem(STORAGE_KEY)
          if (rawDraft) {
            const draft = JSON.parse(rawDraft)
            if (draft?.version === 2) localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...draft, projectId: null }))
          }
        } catch {
          // The library entry is already removed; an unreadable draft must not block the UI.
        }
      }
      setProjectToDelete(null)
    } catch {
      setSaveStatus('error')
    }
  }

  const startTitleEdit = () => {
    setTitleDraft(artworkName)
    setIsEditingTitle(true)
    window.requestAnimationFrame(() => titleInputRef.current?.focus())
  }

  const cancelTitleEdit = () => {
    setTitleDraft(artworkName)
    setIsEditingTitle(false)
  }

  const saveTitle = (event) => {
    event.preventDefault()
    const nextTitle = titleDraft.trim().slice(0, 80) || DEFAULT_ARTWORK_TITLE
    setArtworkName(nextTitle)
    setIsEditingTitle(false)
    setSaveStatus('saving')
    const nextRevision = saveRevisionRef.current + 1
    saveRevisionRef.current = nextRevision
    setSaveRevision(nextRevision)
    try {
      localStorage.setItem(TITLE_STORAGE_KEY, nextTitle)
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        if ((saved?.version === 1 && typeof saved.dataUrl === 'string') || (saved?.version === 2 && saved.project)) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, title: nextTitle }))
        }
      }
    } catch {
      setSaveStatus('error')
    }
  }

  const handleReady = useCallback(({ restored }) => {
    setCanvasReady(true)
    if (restored) {
      setSaveStatus('saved')
      setLastSavedAt((savedAt) => savedAt ?? new Date())
    } else if (initialArtwork || initialProject) {
      setHasArtwork(false)
      setSaveStatus('error')
    }
  }, [initialArtwork, initialProject])

  useEffect(() => {
    if (!canvasReady || saveRevision === 0) return undefined

    const timeoutId = window.setTimeout(async () => {
      if (skipSaveRevisionRef.current === saveRevision) {
        skipSaveRevisionRef.current = null
        try {
          localStorage.removeItem(STORAGE_KEY)
          localStorage.removeItem(TITLE_STORAGE_KEY)
          setSaveStatus('ready')
        } catch {
          setSaveStatus('error')
        }
        return
      }

      try {
        const project = canvasRef.current?.getProject()
        if (!project) throw new Error('Canvas project is unavailable')
        const savedAt = Date.now()
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          version: 2,
          project,
          title: artworkName,
          projectId: currentProjectId,
          savedAt,
        }))
        localStorage.setItem(TITLE_STORAGE_KEY, artworkName)
        setLastSavedAt(new Date(savedAt))
        setSaveStatus('saved')
        if (currentProjectId) {
          const artwork = canvasRef.current?.getDataUrl()
          const preview = artwork ? await createPreview(artwork) : ''
          if (currentProjectIdRef.current !== currentProjectId || saveRevisionRef.current !== saveRevision) return
          const existing = projectsRef.current.find((item) => item.id === currentProjectId)
          persistProjectRecord({ id: currentProjectId, title: artworkName, savedAt, preview: preview || existing?.preview || '', project })
        }
      } catch {
        setSaveStatus('error')
      }
    }, 500)

    return () => window.clearTimeout(timeoutId)
  }, [artworkName, canvasReady, currentProjectId, persistProjectRecord, saveRevision])

  useEffect(() => {
    const flushSave = () => {
      if (!saveRevisionRef.current) return
      try {
        if (skipSaveRevisionRef.current === saveRevisionRef.current) {
          localStorage.removeItem(STORAGE_KEY)
          return
        }
        const project = canvasRef.current?.getProject()
        if (project) {
          const savedAt = Date.now()
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            version: 2,
            project,
            title: artworkNameRef.current,
            projectId: currentProjectIdRef.current,
            savedAt,
          }))
          localStorage.setItem(TITLE_STORAGE_KEY, artworkNameRef.current)
          const projectId = currentProjectIdRef.current
          if (projectId) {
            const existing = projectsRef.current.find((item) => item.id === projectId)
            const record = { id: projectId, title: artworkNameRef.current, savedAt, preview: existing?.preview || '', project }
            const nextProjects = [record, ...projectsRef.current.filter((item) => item.id !== projectId)]
            localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify({ version: 1, projects: nextProjects }))
            projectsRef.current = nextProjects
          }
        }
      } catch {
        setSaveStatus('error')
      }
    }

    window.addEventListener('pagehide', flushSave)
    return () => window.removeEventListener('pagehide', flushSave)
  }, [])

  useEffect(() => {
    const handlePaste = async (event) => {
      const target = document.activeElement
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return

      const items = Array.from(event.clipboardData?.items ?? [])
      const imageItem = items.find((item) => item.type.startsWith('image/'))
      const imageBlob = imageItem?.getAsFile()
      if (!imageBlob) return

      event.preventDefault()
      try {
        const image = await decodeClipboardImage(imageBlob)
        if (canvasRef.current) canvasRef.current.stageImage(image)
        else image.close?.()
      } catch {
        // Ignore unreadable clipboard entries and leave the current artwork unchanged.
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target
      const key = event.key.toLowerCase()
      const shortcut = event.code.startsWith('Key') ? event.code.slice(3).toLowerCase() : key
      const modifier = event.ctrlKey || event.metaKey
      const editingText = target instanceof HTMLElement && (target.isContentEditable || target.tagName === 'TEXTAREA' || (target instanceof HTMLInputElement && ['text', 'search', 'url', 'tel', 'email', 'password'].includes(target.type)))
      if (editingText) return
      if (clearDialogOpen || projectToDelete) {
        if (event.key === 'Escape') {
          setClearDialogOpen(false)
          setProjectToDelete(null)
        }
        return
      }
      if (event.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false)
        return
      }
      const control = target instanceof HTMLElement && ['INPUT', 'SELECT'].includes(target.tagName)
      if (control) return
      if (event.key === 'Escape' && hasPendingPaste) {
        event.preventDefault()
        canvasRef.current?.cancelPendingImage()
        return
      }

      if (modifier && shortcut === 'z') {
        event.preventDefault()
        if (event.shiftKey) canvasRef.current?.redo()
        else canvasRef.current?.undo()
        return
      }
      if (modifier && shortcut === 'y') {
        event.preventDefault()
        canvasRef.current?.redo()
        return
      }

      if (modifier) return
      if (shortcut === 'u') {
        const shapeTools = ['rectangle', 'ellipse', 'line']
        const currentIndex = shapeTools.indexOf(tool)
        const step = event.shiftKey ? -1 : 1
        const nextIndex = currentIndex < 0
          ? (event.shiftKey ? shapeTools.length - 1 : 0)
          : (currentIndex + step + shapeTools.length) % shapeTools.length
        event.preventDefault()
        setTool(shapeTools[nextIndex])
        return
      }
      const shortcutTools = { b: 'brush', e: 'eraser', g: 'fill', i: 'picker' }
      if (shortcutTools[shortcut]) {
        event.preventDefault()
        setTool(shortcutTools[shortcut])
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [clearDialogOpen, hasPendingPaste, mobileMenuOpen, projectToDelete, tool])

  const handleClear = () => {
    skipSaveRevisionRef.current = saveRevisionRef.current + 1
    try {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(TITLE_STORAGE_KEY)
    } catch {
      setSaveStatus('error')
    }
    canvasRef.current?.clear()
    setHasArtwork(false)
    artworkNameRef.current = DEFAULT_ARTWORK_TITLE
    setArtworkName(DEFAULT_ARTWORK_TITLE)
    setTitleDraft(DEFAULT_ARTWORK_TITLE)
    setIsEditingTitle(false)
    setLastSavedAt(null)
    setClearDialogOpen(false)
    setSaveStatus('ready')
  }

  const handleExport = () => {
    const dataUrl = canvasRef.current?.getDataUrl()
    if (!dataUrl) return
    const safeName = artworkName.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'canvas-artwork'
    const blob = dataUrlToBlob(dataUrl)
    if (!blob) return
    const file = new File([blob], `${safeName}.png`, { type: 'image/png' })

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], title: safeName }).catch((error) => {
        if (error.name === 'AbortError') return
        openExportFile(file, safeName, true)
      })
      return
    }

    openExportFile(file, safeName, isAppleMobileBrowser())
  }

  const openExportFile = (file, safeName, openInNewTab) => {
    const fileUrl = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = fileUrl
    link.download = `${safeName}.png`
    if (openInNewTab) {
      link.target = '_blank'
      link.rel = 'noopener'
    }
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(fileUrl), openInNewTab ? 60000 : 1000)
  }

  const status = {
    ready: { icon: Cloud, text: 'Auto-save is on', tone: 'text-slate-500' },
    saving: { icon: LoaderCircle, text: 'Saving your canvas…', tone: 'text-indigo-600' },
    saved: { icon: Check, text: formatSavedTime(lastSavedAt), tone: 'text-emerald-600' },
    error: { icon: Cloud, text: 'Could not save on this device', tone: 'text-amber-600' },
  }[saveStatus]
  const StatusIcon = status.icon

  return (
    <main data-theme={theme} className="app-shell flex h-[100dvh] min-h-0 flex-col overflow-hidden">
      <header className="theme-header z-20 shrink-0 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-3 px-3 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <a className="brand-wordmark" href="https://udopd.ru" target="_blank" rel="noreferrer" aria-label="Open udopd.ru in a new tab">SUPER CUBE</a>
            <span className="h-5 w-px shrink-0 bg-[var(--app-border)]" aria-hidden="true" />
          <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className={`theme-text truncate text-sm font-semibold tracking-tight ${page === 'home' ? 'max-[380px]:hidden' : ''}`}>{page === 'projects' ? 'Projects' : 'Canvas'}</h1>
              </div>
              {page === 'editor' && <div className={`mt-0.5 flex items-center gap-1.5 text-[10px] ${status.tone}`} aria-live="polite">
                <StatusIcon size={12} className={saveStatus === 'saving' ? 'animate-spin' : ''} />
                <span>{status.text}</span>
              </div>}
            </div>
          </div>

          <div className="relative flex shrink-0 items-center gap-1.5 sm:gap-2">
            <div className="hidden items-center gap-1.5 md:flex">
              {page === 'editor' && <>
                <button type="button" onClick={handleGoHome} className="header-secondary-button" aria-label="Go to home"><House size={15} /><span>Home</span></button>
                <button type="button" onClick={handleSaveProject} disabled={!canvasReady} className="header-secondary-button disabled:cursor-not-allowed disabled:opacity-50" aria-label="Save project"><Save size={15} /><span>Save project</span></button>
                <button type="button" onClick={handleShowProjects} className="header-secondary-button" aria-label="Open projects"><FolderOpen size={15} /><span>Projects</span></button>
              </>}
              <button type="button" onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} className="header-icon-button">
                {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
              </button>
              {page === 'editor' ? <>
                <button type="button" onClick={() => setClearDialogOpen(true)} disabled={!canvasReady} className="header-secondary-button disabled:cursor-not-allowed disabled:opacity-50" aria-label="Clear canvas"><Trash2 size={16} /><span>Clear</span></button>
                <button type="button" onClick={handleExport} className="site-cta flex h-10 items-center gap-2 px-3 text-sm font-semibold transition focus-visible:outline-none sm:px-4"><Download size={16} /><span>Export PNG</span></button>
              </> : page === 'projects' ? <>
                <button type="button" onClick={handleGoHome} className="header-secondary-button"><House size={15} /><span>Home</span></button>
                <button type="button" onClick={handleBackToEditor} className="header-secondary-button">Back to editor</button>
              </> : null}
            </div>
            {page === 'editor' ? <button type="button" onClick={() => setMobileMenuOpen((open) => !open)} className="header-icon-button mobile-menu-trigger md:hidden" aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'} aria-expanded={mobileMenuOpen}>
              {mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}
            </button> : <div className="flex items-center gap-1 md:hidden">
              <button type="button" onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} className="header-icon-button">{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button>
              {page === 'projects'
                ? <><button type="button" onClick={handleGoHome} className="header-icon-button" aria-label="Home"><House size={16} /></button><button type="button" onClick={handleBackToEditor} className="header-secondary-button">Editor</button></>
                : null}
            </div>}
            {mobileMenuOpen && page === 'editor' && <div className="mobile-header-menu md:hidden" aria-label="Canvas actions">
              <button type="button" onClick={handleGoHome}><House size={15} />Home</button>
              <button type="button" onClick={() => { setMobileMenuOpen(false); void handleSaveProject() }} disabled={!canvasReady}><Save size={15} />Save project</button>
              <button type="button" onClick={handleShowProjects}><FolderOpen size={15} />Projects</button>
              <button type="button" onClick={() => { setTheme((current) => current === 'light' ? 'dark' : 'light'); setMobileMenuOpen(false) }}>{theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}{theme === 'light' ? 'Dark theme' : 'Light theme'}</button>
              <button type="button" onClick={() => { setClearDialogOpen(true); setMobileMenuOpen(false) }} disabled={!canvasReady}><Trash2 size={15} />Clear canvas</button>
              <button type="button" onClick={() => { handleExport(); setMobileMenuOpen(false) }}><Download size={15} />Export PNG</button>
            </div>}
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-3 overflow-hidden px-3 py-3 sm:gap-4 sm:px-5 sm:py-4 lg:px-8">
        {page === 'projects' ? (
          <ProjectsPage projects={projects} onOpen={handleOpenProject} onNew={handleNewProject} onBack={handleBackToEditor} onDelete={setProjectToDelete} />
        ) : page === 'home' ? (
          <HeroPage
            hasDraft={Boolean(canvasSource.artwork || canvasSource.project)}
            onContinue={handleBackToEditor}
            onNew={handleNewProject}
            onProjects={handleShowProjects}
          />
        ) : <>
          <Toolbar
            tool={tool}
            onToolChange={setTool}
            color={color}
            onColorChange={setColor}
            brushSize={brushSize}
            onBrushSizeChange={setBrushSize}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={() => canvasRef.current?.undo()}
            onRedo={() => canvasRef.current?.redo()}
          />

          <section className="theme-panel flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border p-2 shadow-sm sm:p-3" aria-label="Canvas workspace">
            <div className="flex shrink-0 items-center justify-between gap-3 px-1 pb-2 sm:px-2">
              <div ref={settingsPopoverRef} className="relative min-w-0 flex-1">
                {isEditingTitle ? (
                  <form onSubmit={saveTitle} className="flex max-w-sm items-center gap-1.5">
                    <input
                      ref={titleInputRef}
                      value={titleDraft}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      onKeyDown={(event) => { if (event.key === 'Escape') cancelTitleEdit() }}
                      maxLength={80}
                      aria-label="Artwork name"
                      className="theme-text min-w-0 flex-1 border-b border-white/60 bg-transparent py-1 text-xs font-medium outline-none"
                    />
                    <button type="submit" className="theme-muted rounded p-1 hover:text-white" aria-label="Save artwork name" title="Save name"><Check size={14} /></button>
                    <button type="button" onClick={cancelTitleEdit} className="theme-muted rounded p-1 hover:text-rose-600" aria-label="Cancel rename" title="Cancel"><X size={14} /></button>
                  </form>
                ) : (
                  <div className="flex min-w-0 items-center gap-1.5">
                    <h3 className="theme-text truncate text-xs font-medium">{artworkName}</h3>
                    <button type="button" onClick={startTitleEdit} className="theme-muted rounded p-1 transition hover:text-indigo-600" aria-label="Rename artwork" title="Rename artwork"><Pencil size={12} /></button>
                    <button type="button" onClick={() => setSettingsOpen((open) => !open)} className="theme-muted rounded p-1 transition hover:text-indigo-600" aria-label="Canvas settings" aria-expanded={settingsOpen} title="Canvas settings"><Settings2 size={14} /></button>
                  </div>
                )}
                {settingsOpen && (
                  <div className="absolute left-0 top-full z-30 mt-2">
                    <CanvasSettings
                      width={canvasSize.width}
                      height={canvasSize.height}
                      transparent={transparent}
                      onApplySize={(nextWidth, nextHeight) => setCanvasSize({ width: nextWidth, height: nextHeight })}
                      onToggleTransparency={(event) => setTransparent(event.target.checked)}
                      onClose={() => setSettingsOpen(false)}
                    />
                  </div>
                )}
              </div>
              <div className="theme-muted flex min-w-0 shrink-0 items-center gap-2 text-[10px]">
                <span className="hidden sm:inline">{canvasSize.width} × {canvasSize.height}</span>
                {hasPendingPaste && <span className="paste-hint-active" title="Move the pointer and click to place, or press Escape to cancel">Move image · click to place · Esc to cancel</span>}
                {hasArtwork && <span className="canvas-meta-status hidden items-center gap-1 sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-white/40" /> Edited</span>}
                <button type="button" onClick={() => setMobileLayersOpen((open) => !open)} className="mobile-layers-trigger lg:hidden" aria-expanded={mobileLayersOpen} aria-controls="canvas-layers-panel"><Layers3 size={13} /><span>Layers</span><span className="mobile-layer-count">{layers.length}</span></button>
              </div>
            </div>

            <div className="canvas-layout relative flex min-h-0 flex-1 flex-col gap-2 lg:flex-row lg:gap-3">
              <div className="canvas-workspace flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg border p-2 sm:p-3">
                <Canvas
                  key={canvasMountKey}
                  ref={canvasRef}
                  tool={tool}
                  color={color}
                  brushSize={brushSize}
                  width={canvasSize.width}
                  height={canvasSize.height}
                  transparent={transparent}
                  initialArtwork={initialArtwork}
                  initialProject={initialProject}
                  onContentChange={handleContentChange}
                  onHistoryChange={handleHistoryChange}
                  onLayersChange={handleLayersChange}
                  onColorPick={setColor}
                  onPastePreviewChange={setHasPendingPaste}
                  onReady={handleReady}
                />
              </div>
              <CanvasPanel
                id="canvas-layers-panel"
                className={`mobile-layers-panel ${mobileLayersOpen ? 'mobile-layers-open' : 'mobile-layers-closed'}`}
                layers={layers}
                activeLayerId={activeLayerId}
                onAddLayer={() => canvasRef.current?.addLayer()}
                onSelectLayer={(id) => canvasRef.current?.selectLayer(id)}
                onToggleLayer={(id) => canvasRef.current?.toggleLayer(id)}
                onRenameLayer={(id, name) => canvasRef.current?.renameLayer(id, name)}
                onDeleteLayer={(id) => canvasRef.current?.deleteLayer(id)}
                onMoveLayer={(id, targetId) => canvasRef.current?.moveLayer(id, targetId)}
              />
            </div>
          </section>
        </>}
      </div>

      {clearDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setClearDialogOpen(false) }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="clear-title" aria-describedby="clear-description" className="theme-panel w-full max-w-sm rounded-2xl border p-6 shadow-2xl shadow-slate-950/20">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600"><Trash2 size={18} /></div>
              <button type="button" onClick={() => setClearDialogOpen(false)} aria-label="Close dialog" className="clear-dialog-close rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X size={17} /></button>
            </div>
            <h2 id="clear-title" className="theme-text text-lg font-bold tracking-tight">Clear this canvas?</h2>
            <p id="clear-description" className="theme-muted mt-2 text-sm leading-relaxed">This clears the current canvas and its autosaved draft. Projects you saved in the project list stay available.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setClearDialogOpen(false)} className="theme-muted h-10 rounded-xl px-4 text-sm font-semibold transition hover:bg-slate-100">Cancel</button>
              <button type="button" autoFocus onClick={handleClear} className="site-cta h-10 px-4 text-sm font-semibold transition">Clear canvas</button>
            </div>
          </section>
        </div>
      )}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProjectToDelete(null) }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="delete-project-title" aria-describedby="delete-project-description" className="theme-panel w-full max-w-sm border p-5">
            <h2 id="delete-project-title" className="theme-text text-base font-semibold">Delete project?</h2>
            <p id="delete-project-description" className="theme-muted mt-2 text-sm leading-relaxed">“{projectToDelete.title}” will be permanently removed from this device.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setProjectToDelete(null)} className="theme-muted h-9 px-3 text-xs font-semibold transition hover:bg-[var(--panel-subtle)]">Cancel</button>
              <button type="button" autoFocus onClick={confirmDeleteProject} className="danger-cta h-9 px-3 text-xs font-semibold transition">Delete project</button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
