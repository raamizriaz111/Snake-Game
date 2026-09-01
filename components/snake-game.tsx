"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

const GRID = 20 // cells per side
const BASE_SPEED = 140 // ms per tick at start
const MIN_SPEED = 60 // fastest tick
const SPEED_STEP = 4 // ms faster per food eaten

type Point = { x: number; y: number }
type Dir = "up" | "down" | "left" | "right"
type Status = "idle" | "running" | "paused" | "over"

const DIRS: Record<Dir, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

const OPPOSITE: Record<Dir, Dir> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
}

function randomFood(snake: Point[]): Point {
  while (true) {
    const p = {
      x: Math.floor(Math.random() * GRID),
      y: Math.floor(Math.random() * GRID),
    }
    if (!snake.some((s) => s.x === p.x && s.y === p.y)) return p
  }
}

const INITIAL_SNAKE: Point[] = [
  { x: 8, y: 10 },
  { x: 7, y: 10 },
  { x: 6, y: 10 },
]

export function SnakeGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [status, setStatus] = useState<Status>("idle")
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)

  // Mutable game state kept in refs so the loop doesn't re-subscribe.
  const snakeRef = useRef<Point[]>(INITIAL_SNAKE)
  const foodRef = useRef<Point>({ x: 13, y: 10 })
  const dirRef = useRef<Dir>("right")
  const queueRef = useRef<Dir[]>([]) // buffered turns for this + next tick
  const statusRef = useRef<Status>("idle")
  const scoreRef = useRef(0)

  useEffect(() => {
    statusRef.current = status
  }, [status])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const size = canvas.clientWidth
    if (canvas.width !== size * dpr) {
      canvas.width = size * dpr
      canvas.height = size * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const cell = size / GRID
    const css = getComputedStyle(document.documentElement)
    // These custom properties already contain full `oklch(...)` color strings.
    const bg = css.getPropertyValue("--background").trim() || "#0a1410"
    const grid = css.getPropertyValue("--border").trim() || "#334"
    // Sharp, high-visibility neon colors for gameplay elements.
    const primary = "#00ff5f" // neon green snake
    const accent = "#ff1f6b" // bright magenta-red food

    // Board
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, size, size)

    // Grid lines
    ctx.globalAlpha = 0.5
    ctx.strokeStyle = grid
    ctx.lineWidth = 1
    for (let i = 1; i < GRID; i++) {
      ctx.beginPath()
      ctx.moveTo(i * cell, 0)
      ctx.lineTo(i * cell, size)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, i * cell)
      ctx.lineTo(size, i * cell)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // Food
    const f = foodRef.current
    ctx.fillStyle = accent
    ctx.shadowColor = accent
    ctx.shadowBlur = 12
    const fp = cell * 0.2
    ctx.fillRect(f.x * cell + fp, f.y * cell + fp, cell - fp * 2, cell - fp * 2)
    ctx.shadowBlur = 0

    // Snake
    const snake = snakeRef.current
    ctx.fillStyle = primary
    ctx.shadowColor = primary
    for (let i = 0; i < snake.length; i++) {
      const s = snake[i]
      const head = i === 0
      ctx.shadowBlur = head ? 16 : 0
      ctx.globalAlpha = head ? 1 : 1 - (i / snake.length) * 0.55
      const pad = head ? cell * 0.06 : cell * 0.12
      ctx.fillRect(s.x * cell + pad, s.y * cell + pad, cell - pad * 2, cell - pad * 2)
    }
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
  }, [])

  const resetState = useCallback(() => {
    snakeRef.current = INITIAL_SNAKE.map((p) => ({ ...p }))
    foodRef.current = randomFood(snakeRef.current)
    dirRef.current = "right"
    queueRef.current = []
    scoreRef.current = 0
    setScore(0)
  }, [])

  const startGame = useCallback(() => {
    resetState()
    setStatus("running")
    statusRef.current = "running"
  }, [resetState])

  // Main game loop.
  useEffect(() => {
    let raf = 0
    let last = performance.now()

    const step = (now: number) => {
      raf = requestAnimationFrame(step)
      const speed = Math.max(MIN_SPEED, BASE_SPEED - scoreRef.current * SPEED_STEP)
      if (now - last < speed) return
      last = now

      if (statusRef.current !== "running") {
        draw()
        return
      }

      // Apply the next buffered turn.
      const next = queueRef.current.shift()
      if (next && next !== OPPOSITE[dirRef.current]) {
        dirRef.current = next
      }

      const snake = snakeRef.current
      const d = DIRS[dirRef.current]
      const head = { x: snake[0].x + d.x, y: snake[0].y + d.y }

      // Wall or self collision -> game over.
      const hitWall = head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID
      const hitSelf = snake.some((s, i) => i < snake.length - 1 && s.x === head.x && s.y === head.y)
      if (hitWall || hitSelf) {
        setStatus("over")
        statusRef.current = "over"
        setBest((b) => Math.max(b, scoreRef.current))
        draw()
        return
      }

      const newSnake = [head, ...snake]
      if (head.x === foodRef.current.x && head.y === foodRef.current.y) {
        scoreRef.current += 1
        setScore(scoreRef.current)
        foodRef.current = randomFood(newSnake)
      } else {
        newSnake.pop()
      }
      snakeRef.current = newSnake
      draw()
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [draw])

  // Redraw on mount / resize.
  useEffect(() => {
    draw()
    const onResize = () => draw()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [draw])

  const turn = useCallback((dir: Dir) => {
    // Buffer up to 2 turns; ignore immediate reversal against the last queued/current dir.
    const q = queueRef.current
    const lastDir = q.length ? q[q.length - 1] : dirRef.current
    if (dir === lastDir || dir === OPPOSITE[lastDir]) return
    if (q.length < 2) q.push(dir)
  }, [])

  // Keyboard controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const map: Record<string, Dir> = {
        arrowup: "up",
        arrowdown: "down",
        arrowleft: "left",
        arrowright: "right",
        w: "up",
        s: "down",
        a: "left",
        d: "right",
      }
      if (key === " " || key === "p") {
        e.preventDefault()
        if (statusRef.current === "running") setStatus("paused")
        else if (statusRef.current === "paused") setStatus("running")
        else if (statusRef.current === "idle" || statusRef.current === "over") startGame()
        return
      }
      const dir = map[key]
      if (dir) {
        e.preventDefault()
        if (statusRef.current === "idle") startGame()
        if (statusRef.current === "running") turn(dir)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [startGame, turn])

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <Scoreboard score={score} best={best} />

      <div className="relative aspect-square w-full overflow-hidden rounded-md border-2 border-primary/40 bg-card shadow-[0_0_40px_-8px_var(--primary)]">
        <canvas ref={canvasRef} className="block h-full w-full" aria-label="Snake game board" role="img" />
        {/* CRT scanline overlay */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-20 mix-blend-overlay"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent 0, transparent 2px, oklch(0 0 0) 2px, oklch(0 0 0) 3px)",
          }}
        />
        <Overlay status={status} score={score} best={best} onStart={startGame} onResume={() => setStatus("running")} />
      </div>

      <TouchControls onTurn={turn} />

      <p className="text-center text-xs text-muted-foreground">
        Arrow keys / WASD to move · Space to pause
      </p>
    </div>
  )
}

function Scoreboard({ score, best }: { score: number; best: number }) {
  return (
    <div className="flex items-end justify-between">
      <div>
        <p className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">Score</p>
        <p className="font-display text-2xl text-primary tabular-nums leading-none">
          {String(score).padStart(3, "0")}
        </p>
      </div>
      <h1 className="font-display text-lg text-foreground">SNAKE</h1>
      <div className="text-right">
        <p className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">Best</p>
        <p className="font-display text-2xl text-accent tabular-nums leading-none">
          {String(best).padStart(3, "0")}
        </p>
      </div>
    </div>
  )
}

function Overlay({
  status,
  score,
  best,
  onStart,
  onResume,
}: {
  status: Status
  score: number
  best: number
  onStart: () => void
  onResume: () => void
}) {
  if (status === "running") return null

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm">
      {status === "idle" && (
        <>
          <p className="font-display text-base text-primary">READY?</p>
          <p className="max-w-[16rem] text-balance text-center text-xs text-muted-foreground">
            Eat the glowing pellets to grow. Avoid the walls and yourself.
          </p>
          <Button onClick={onStart} className="font-display text-xs">
            PRESS START
          </Button>
        </>
      )}
      {status === "paused" && (
        <>
          <p className="font-display text-base text-foreground">PAUSED</p>
          <Button onClick={onResume} className="font-display text-xs">
            RESUME
          </Button>
        </>
      )}
      {status === "over" && (
        <>
          <p className="font-display text-base text-destructive">GAME OVER</p>
          <div className="text-center">
            <p className="font-display text-xl text-primary">{String(score).padStart(3, "0")}</p>
            {score >= best && score > 0 ? (
              <p className="mt-1 text-xs text-accent">NEW BEST!</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Best {String(best).padStart(3, "0")}</p>
            )}
          </div>
          <Button onClick={onStart} className="font-display text-xs">
            PLAY AGAIN
          </Button>
        </>
      )}
    </div>
  )
}

function TouchControls({ onTurn }: { onTurn: (dir: Dir) => void }) {
  const btn =
    "flex h-14 w-14 items-center justify-center rounded-md border-2 border-primary/40 bg-secondary text-primary active:bg-primary active:text-primary-foreground transition-colors select-none"
  return (
    <div className="mx-auto grid grid-cols-3 grid-rows-2 gap-2 sm:hidden" role="group" aria-label="Directional controls">
      <button className={`${btn} col-start-2`} onClick={() => onTurn("up")} aria-label="Up">
        <Arrow dir="up" />
      </button>
      <button className={`${btn} col-start-1 row-start-2`} onClick={() => onTurn("left")} aria-label="Left">
        <Arrow dir="left" />
      </button>
      <button className={`${btn} col-start-2 row-start-2`} onClick={() => onTurn("down")} aria-label="Down">
        <Arrow dir="down" />
      </button>
      <button className={`${btn} col-start-3 row-start-2`} onClick={() => onTurn("right")} aria-label="Right">
        <Arrow dir="right" />
      </button>
    </div>
  )
}

function Arrow({ dir }: { dir: Dir }) {
  const rotate: Record<Dir, string> = {
    up: "rotate-0",
    right: "rotate-90",
    down: "rotate-180",
    left: "-rotate-90",
  }
  return (
    <svg
      className={rotate[dir]}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12l7-7 7 7" />
    </svg>
  )
}
