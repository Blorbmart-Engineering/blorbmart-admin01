import { useEffect, useLayoutEffect, useReducer, useRef } from 'react'
import { cn } from './ui'

/*
 * The Blorbmart mark — the B drawn as a shopping-cart handle — traced from the
 * master artwork. The same path the landing page at www draws, so the console
 * carries the company's logo rather than a letter in a box.
 */
const MARK_PATH = 'M 282.1 325.1 C 277 325.6, 270 327, 266.6 328.1 C 226.1 341.6, 220.7 400, 257.8 422.4 C 266.1 427.3, 271.9 429, 286.5 430.5 C 305.6 432.5, 315.9 436.9, 327.1 448.1 C 341 461.9, 342.3 466.8, 357.4 561 C 360.9 582.7, 367.4 621.9, 371.8 648 C 376.2 674.1, 381.9 707.9, 384.3 723 C 406.5 857.9, 408.9 868.2, 423.5 892.9 C 445.8 930.6, 478.5 958.4, 516 971.5 C 540.5 980, 560.8 982, 622.5 982 C 691 982, 712.8 978.8, 742.3 964.6 C 782.2 945.4, 816.4 905.5, 831.4 860.8 C 850.8 802.8, 831.8 730.4, 786.8 691.1 C 775.3 681.1, 775.3 681.2, 783.5 668.6 C 845.7 572.8, 791.9 440.7, 683.5 423.5 C 667.4 420.9, 637.6 420, 574 419.9 C 539.6 419.9, 508.1 419.8, 503.9 419.7 C 489.8 419.4, 489.7 419.9, 496.9 463.6 C 499.7 480.1, 503 501.4, 504.5 511 C 507.5 531.8, 507.4 531.4, 510.7 534 C 513.2 536, 514.5 536, 582.9 536 C 659.1 536, 657.4 535.9, 668.9 542 C 681.8 548.9, 693.6 566.1, 696.2 581.8 C 700.4 607, 681.2 634.3, 654.8 640.5 C 649.6 641.7, 638.3 642, 590.2 642 C 551.9 642, 531.2 642.4, 529.9 643 C 527.2 644.5, 527.3 645.1, 534.5 686.4 C 538 706.8, 542.1 730.7, 543.6 739.5 C 545.2 749.5, 546.7 756.2, 547.7 757.3 C 549.2 758.9, 553.5 759, 610.4 759 C 678.2 759, 679.8 759.2, 692.6 765.5 C 719.4 778.7, 729.3 808.7, 716 836.6 C 708.1 853, 696.3 861.1, 675.6 864.5 C 662.7 866.5, 583.5 866.6, 572 864.6 C 553.6 861.3, 535.3 848.4, 525.1 831.6 C 517.1 818.3, 513.8 805.9, 507.5 765.4 C 504.9 748.9, 499.9 719.8, 496.4 700.5 C 492.8 681.3, 486.8 647.1, 483 624.5 C 479.2 602, 474.8 575.6, 473.1 566 C 471.4 556.4, 469.1 541.3, 468 532.5 C 465.4 512.6, 454.5 447.5, 452.4 439.8 C 439.3 389.2, 402 347.9, 355.1 331.9 C 335.9 325.3, 306.5 322.6, 282.1 325.1'
const VIEWBOX = '220 322 630 659'

/** The mark on its own. Fills with the current text colour. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox={VIEWBOX} className={cn('shrink-0', className)} aria-hidden>
      <path d={MARK_PATH} fill="currentColor" />
    </svg>
  )
}

/** The mark on a brand tile — the console's logo in the rail and at sign-in. */
export function BrandTile({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-lg bg-brand text-white', className)}>
      <BrandMark className={markClassName} />
    </span>
  )
}

/*
 * When the first splash of this page load appeared.
 *
 * Signing in shows splashes back to back — the session check, then the
 * Suspense fallback while a page downloads — and each is a fresh mount.
 * Without a shared clock the pen would restart on every one. With it, a later
 * splash joins the drawing where it is, and one that turns up long after load
 * is simply the finished mark.
 */
let drawStartedAt: number | null = null

/** Pen down to fill settled, matching the delays in index.css. */
const DRAW_MS = 1100

function drawLeft() {
  return drawStartedAt === null ? 0 : drawStartedAt + DRAW_MS - performance.now()
}

/**
 * The mark written in, the way it is on www: the outline is traced, then the
 * fill comes in behind the pen. If the wait outlasts the drawing, the
 * finished mark pulses.
 */
export function BrandMarkDraw({ className }: { className?: string }) {
  const svg = useRef<SVGSVGElement>(null)

  useLayoutEffect(() => {
    const now = performance.now()
    drawStartedAt ??= now
    svg.current?.style.setProperty('--mark-t', `${drawStartedAt - now}ms`)
  }, [])

  return (
    <svg
      ref={svg}
      viewBox={VIEWBOX}
      className={cn('mark-draw shrink-0 overflow-visible', className)}
      role="img"
      aria-label="Blorbmart"
    >
      <path d={MARK_PATH} pathLength={1} fill="currentColor" stroke="currentColor" strokeWidth={18} strokeLinejoin="round" />
    </svg>
  )
}

/**
 * True while the splash mark is still being written.
 *
 * A guard that has its answer before the pen lifts holds the splash until it
 * does, so a fast sign-in shows a finished mark rather than a stroke cut off
 * mid-letter. It never holds a screen that showed no splash.
 */
export function useMarkStillDrawing(): boolean {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const drawing = drawLeft() > 0

  useEffect(() => {
    if (!drawing) return
    const timer = window.setTimeout(rerender, drawLeft())
    return () => window.clearTimeout(timer)
  }, [drawing])

  return drawing
}
