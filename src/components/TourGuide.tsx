'use client'

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { TOUR_STEPS, markTourSeen } from '@/lib/tour'

interface Props {
  onClose: () => void
}

interface Box { top: number; left: number; width: number; height: number }

const CARD_W = 320
const GAP = 12
const PAD = 6

export default function TourGuide({ onClose }: Props) {
  const [i, setI] = useState(0)
  const [box, setBox] = useState<Box | null>(null)

  const step = TOUR_STEPS[i]
  const isLast = i === TOUR_STEPS.length - 1

  const finish = useCallback(() => {
    markTourSeen()
    onClose()
  }, [onClose])

  // Measure the spotlight target. useLayoutEffect so the card never paints at
  // a stale position first.
  useLayoutEffect(() => {
    if (!step.target) {
      setBox(null)
      return
    }
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
    if (!el) {
      // A target can be absent (e.g. an empty board): fall back to a centred
      // card rather than pointing at nothing.
      setBox(null)
      return
    }
    const measure = () => {
      const r = el.getBoundingClientRect()
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step.target, i])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') finish()
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        if (isLast) finish()
        else setI((n) => n + 1)
      }
      if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isLast, finish])

  // Card position, clamped to stay on screen at any window size
  function cardStyle(): React.CSSProperties {
    if (!box) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: CARD_W,
      }
    }
    const place = step.placement ?? 'bottom'
    let top = box.top + box.height + GAP
    let left = box.left

    if (place === 'top') top = box.top - GAP
    if (place === 'right') { top = box.top; left = box.left + box.width + GAP }
    if (place === 'left') { top = box.top; left = box.left - CARD_W - GAP }

    // Keep the card inside the viewport
    left = Math.max(GAP, Math.min(left, window.innerWidth - CARD_W - GAP))
    const maxTop = window.innerHeight - 200
    if (place === 'top') {
      return { top: Math.max(GAP, top), left, width: CARD_W, transform: 'translateY(-100%)' }
    }
    return { top: Math.max(GAP, Math.min(top, maxTop)), left, width: CARD_W }
  }

  return (
    <div className="fixed inset-0 z-[100]" style={{ pointerEvents: 'none' }}>
      {/* Dim layer. Four panels around the target rather than one overlay with
          a hole, so the highlighted element stays visually crisp. */}
      {box ? (
        <>
          <div style={panel(0, 0, '100vw', box.top - PAD)} />
          <div style={panel(box.top - PAD, 0, box.left - PAD, box.height + PAD * 2)} />
          <div
            style={panel(
              box.top - PAD,
              box.left + box.width + PAD,
              `calc(100vw - ${box.left + box.width + PAD}px)`,
              box.height + PAD * 2
            )}
          />
          <div
            style={panel(
              box.top + box.height + PAD,
              0,
              '100vw',
              `calc(100vh - ${box.top + box.height + PAD}px)`
            )}
          />
          {/* Ring around the target */}
          <div
            style={{
              position: 'fixed',
              top: box.top - PAD,
              left: box.left - PAD,
              width: box.width + PAD * 2,
              height: box.height + PAD * 2,
              border: '2px solid #1773eb',
              borderRadius: 8,
              boxShadow: '0 0 0 4px rgba(23,115,235,0.25)',
              pointerEvents: 'none',
            }}
          />
        </>
      ) : (
        <div style={panel(0, 0, '100vw', '100vh')} />
      )}

      {/* Card */}
      <div
        className="fixed bg-white rounded-xl shadow-2xl p-4"
        style={{ ...cardStyle(), pointerEvents: 'auto' }}
      >
        <button
          className="absolute top-3 right-3 text-gray-300 hover:text-gray-600 transition-colors"
          onClick={finish}
          title="Skip the tour"
        >
          <X size={14} />
        </button>

        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
          Step {i + 1} of {TOUR_STEPS.length}
        </p>
        <h3 className="text-sm font-bold text-gray-900 mb-1.5 pr-5">{step.title}</h3>
        <p className="text-xs text-gray-600 leading-relaxed mb-4">{step.body}</p>

        <div className="flex items-center justify-between">
          {/* Progress dots double as direct navigation */}
          <div className="flex items-center gap-1">
            {TOUR_STEPS.map((_, n) => (
              <button
                key={n}
                aria-label={`Go to step ${n + 1}`}
                onClick={() => setI(n)}
                style={{
                  width: n === i ? 14 : 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: n === i ? '#1773eb' : '#d1d5db',
                  transition: 'all 120ms',
                }}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {i > 0 && (
              <button
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-900 transition-colors"
                onClick={() => setI((n) => n - 1)}
              >
                <ArrowLeft size={11} /> Back
              </button>
            )}
            <button
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-xs font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#1773eb' }}
              onClick={() => (isLast ? finish() : setI((n) => n + 1))}
            >
              {isLast ? 'Get started' : 'Next'}
              {!isLast && <ArrowRight size={11} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function panel(
  top: number | string,
  left: number | string,
  width: number | string,
  height: number | string
): React.CSSProperties {
  return {
    position: 'fixed',
    top,
    left,
    width,
    height,
    backgroundColor: 'rgba(15,16,66,0.55)',
    pointerEvents: 'auto',
  }
}
