import { ArrowLeft, FolderOpen, Plus, Trash2 } from 'lucide-react'

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export default function ProjectsPage({ projects, onOpen, onNew, onBack, onDelete }) {
  return (
    <section className="projects-page theme-panel flex min-h-0 flex-1 flex-col border" aria-label="Saved projects">
      <div className="projects-heading flex shrink-0 items-center justify-between gap-4 border-b px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onBack} className="projects-icon-button" aria-label="Back to editor" title="Back to editor"><ArrowLeft size={17} /></button>
          <div className="min-w-0">
            <p className="theme-muted text-[10px] font-semibold uppercase tracking-[0.14em]">SC Canvas</p>
            <h2 className="theme-text mt-0.5 text-lg font-semibold tracking-tight">Projects</h2>
          </div>
        </div>
        <button type="button" onClick={onNew} className="site-cta flex h-9 shrink-0 items-center gap-2 px-3 text-xs font-semibold transition"><Plus size={15} /><span>New project</span></button>
      </div>

      <div className="projects-list min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {projects.length ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {projects.map((project) => (
              <article key={project.id} className="project-card group relative min-w-0 overflow-hidden border transition">
                <div className="project-preview relative flex aspect-[4/3] items-center justify-center overflow-hidden">
                  <button type="button" onClick={() => onOpen(project)} className="project-open-button absolute inset-0 flex items-center justify-center" aria-label={`Open ${project.title}`}>
                    {project.preview ? (
                      <img src={project.preview} alt={`Preview of ${project.title}`} className="h-full w-full object-contain" loading="lazy" />
                    ) : (
                      <div className="theme-muted flex flex-col items-center gap-2"><FolderOpen size={25} strokeWidth={1.3} /><span className="text-[10px]">No preview</span></div>
                    )}
                  </button>
                  <button type="button" onClick={() => onDelete(project)} className="project-delete-button" aria-label={`Delete ${project.title}`} title={`Delete ${project.title}`}><Trash2 size={14} /></button>
                </div>
                <button type="button" onClick={() => onOpen(project)} className="project-card-meta block w-full border-t px-3 py-3 text-left">
                  <h3 className="theme-text truncate text-sm font-semibold">{project.title}</h3>
                  <p className="theme-muted mt-1 text-[11px]">Saved {dateTimeFormatter.format(new Date(project.savedAt))}</p>
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center">
            <div className="projects-empty-icon flex h-12 w-12 items-center justify-center border"><FolderOpen size={20} strokeWidth={1.4} /></div>
            <h3 className="theme-text mt-4 text-sm font-semibold">No saved projects yet</h3>
            <p className="theme-muted mt-1 max-w-xs text-xs leading-relaxed">Save your artwork from the editor and it will appear here with a preview.</p>
            <button type="button" onClick={onBack} className="theme-muted mt-4 text-xs font-semibold transition hover:text-[var(--app-text)]">Back to editor</button>
          </div>
        )}
      </div>
    </section>
  )
}
