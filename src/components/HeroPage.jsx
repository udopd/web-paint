import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, FolderOpen } from 'lucide-react'

// Replace a title or preview path here to swap the examples shown on the home page.
const exampleArtworks = [
  { id: 'soft-forms', title: 'Soft forms', preview: '/examples/soft-forms.png' },
  { id: 'quiet-orbit', title: 'Quiet orbit', preview: '/examples/quiet-orbit.png' },
  { id: 'blue-hour', title: 'Blue hour', preview: '/examples/blue-hour.png' },
]

function wrapIndex(index, length) {
  return ((index % length) + length) % length
}

function ArtworkCard({ artwork, position, onSelect, slideDirection = 1 }) {
  const side = position !== 'active'
  return (
    <button
      type="button"
      className={`hero-artwork-card hero-artwork-${position} ${position === 'active' ? slideDirection > 0 ? 'hero-slide-from-right' : 'hero-slide-from-left' : ''}`}
      onClick={onSelect}
      tabIndex={side ? -1 : 0}
      aria-label={`Show example ${artwork.title}`}
    >
      <div className="hero-artwork-image">
        <img src={artwork.preview} alt="" draggable="false" />
      </div>
      {position === 'active' && (
        <div className="hero-artwork-caption">
          <h2 className="truncate">{artwork.title}</h2>
        </div>
      )}
    </button>
  )
}

export default function HeroPage({ hasDraft, onContinue, onNew, onProjects }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [slideDirection, setSlideDirection] = useState(1)
  const [paused, setPaused] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)
  const pointerStartRef = useRef(null)
  const didSwipeRef = useRef(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduceMotion(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])

  useEffect(() => {
    if (exampleArtworks.length < 2 || paused || reduceMotion) return undefined
    const timer = window.setInterval(() => {
      setSlideDirection(1)
      setActiveIndex((current) => wrapIndex(current + 1, exampleArtworks.length))
    }, 5200)
    return () => window.clearInterval(timer)
  }, [paused, reduceMotion])

  const showPrevious = () => {
    setSlideDirection(-1)
    setActiveIndex((current) => wrapIndex(current - 1, exampleArtworks.length))
  }
  const showNext = () => {
    setSlideDirection(1)
    setActiveIndex((current) => wrapIndex(current + 1, exampleArtworks.length))
  }

  const currentArtwork = exampleArtworks[activeIndex]
  const previousArtwork = exampleArtworks[wrapIndex(activeIndex - 1, exampleArtworks.length)]
  const nextArtwork = exampleArtworks[wrapIndex(activeIndex + 1, exampleArtworks.length)]

  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    pointerStartRef.current = { x: event.clientX, y: event.clientY }
    didSwipeRef.current = false
  }

  const handlePointerUp = (event) => {
    const start = pointerStartRef.current
    pointerStartRef.current = null
    if (!start || exampleArtworks.length < 2) return
    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    if (Math.abs(deltaX) < 44 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return
    didSwipeRef.current = true
    if (deltaX < 0) showNext()
    else showPrevious()
  }

  const blockSwipedClick = (event) => {
    if (!didSwipeRef.current) return
    event.preventDefault()
    event.stopPropagation()
    didSwipeRef.current = false
  }

  return (
    <section className="hero-page" aria-label="SC Canvas home">
      <div className="hero-intro">
        <h1 className="hero-title-brush-reveal">Make room<br className="sm:hidden" /> for <span>ideas.</span></h1>
        <div className="hero-actions">
          <button type="button" onClick={hasDraft ? onContinue : onNew} className="hero-primary-button">
            {hasDraft ? 'Continue creating' : 'Start creating'} <ArrowUpRight size={16} />
          </button>
          <button type="button" onClick={onProjects} className="hero-secondary-button"><FolderOpen size={15} /> Browse projects</button>
        </div>
      </div>

      <div
          className="hero-carousel"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false) }}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { pointerStartRef.current = null }}
          onClickCapture={blockSwipedClick}
          aria-label="Example artwork carousel"
        >
          <div className="hero-carousel-heading">
            <p className="hero-kicker">EXAMPLE WORKS</p>
          </div>

          <div className="hero-carousel-stage">
            <ArtworkCard key={`${previousArtwork.id}-previous`} artwork={previousArtwork} position="previous" onSelect={showPrevious} />
            <ArtworkCard key={`${currentArtwork.id}-active`} artwork={currentArtwork} position="active" slideDirection={slideDirection} onSelect={showNext} />
            <ArtworkCard key={`${nextArtwork.id}-next`} artwork={nextArtwork} position="next" onSelect={showNext} />
          </div>

          {exampleArtworks.length > 1 && <div className="hero-carousel-footer">
            <div className="hero-carousel-dots" aria-label="Choose artwork">
              {exampleArtworks.map((artwork, index) => <button key={artwork.id} type="button" aria-label={`Show ${artwork.title}`} aria-current={index === activeIndex ? 'true' : undefined} onClick={() => { setSlideDirection(index >= activeIndex ? 1 : -1); setActiveIndex(index) }} />)}
            </div>
          </div>}
        </div>
    </section>
  )
}
