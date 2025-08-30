"use client"

import { useState, useEffect, useRef, ReactNode } from "react"
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'

interface BackgroundProps {
  children: ReactNode;
}

export default function Background({children}: BackgroundProps) {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [time, setTime] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: e.clientX,
        y: e.clientY,
      })
    }

    const timer = setInterval(() => {
      setTime((prev) => prev + 0.01)
    }, 16)

    window.addEventListener("mousemove", handleMouseMove)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      clearInterval(timer)
    }
  }, [])

  // Canvas animation for the background
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas dimensions
    const setCanvasDimensions = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    setCanvasDimensions()
    window.addEventListener("resize", setCanvasDimensions)

    // Create nodes
    const nodeCount = 50
    const nodes = Array.from({ length: nodeCount }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 2 + 1,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      color: `rgba(${Math.floor(Math.random() * 100 + 100)}, ${Math.floor(Math.random() * 100 + 150)}, ${Math.floor(
        Math.random() * 55 + 200,
      )}, ${Math.random() * 0.5 + 0.2})`,
    }))

    // Animation function
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw connections
      ctx.lineWidth = 0.5
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < 150) {
            ctx.beginPath()
            ctx.strokeStyle = `rgba(59, 130, 246, ${0.2 * (1 - distance / 150)})`
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.stroke()
          }
        }
      }

      // Draw and update nodes
      nodes.forEach((node) => {
        // Draw node
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.fillStyle = node.color
        ctx.fill()

        // Update position
        node.x += node.vx
        node.y += node.vy

        // Bounce off edges
        if (node.x < 0 || node.x > canvas.width) node.vx *= -1
        if (node.y < 0 || node.y > canvas.height) node.vy *= -1

        // Mouse interaction
        const dx = mousePosition.x - node.x
        const dy = mousePosition.y - node.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        if (distance < 100) {
          node.x -= (dx / distance) * 0.5
          node.y -= (dy / distance) * 0.5
        }
      })

      requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener("resize", setCanvasDimensions)
    }
  }, [mousePosition])

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-slate-800">
      {/* Dynamic Background Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 z-0" style={{ opacity: 0.8 }} />

      {/* Background Elements */}
      <div className="absolute inset-0 z-0">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-700 via-slate-700 to-cyan-700" />

        {/* Dynamic gradient that follows mouse */}
        <div
          className="absolute inset-0 opacity-40 transition-all duration-700 ease-out"
          style={{
            background: `radial-gradient(circle at ${mousePosition.x}px ${mousePosition.y}px, 
              rgba(59, 130, 246, 0.4) 0%, 
              rgba(147, 197, 253, 0.2) 20%, 
              rgba(6, 182, 212, 0.1) 40%, 
              transparent 60%)`,
          }}
        />

        {/* Animated hexagonal pattern */}
        <div className="absolute inset-0">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="hexagons" x="0" y="0" width="100" height="87" patternUnits="userSpaceOnUse">
                <polygon
                  points="50,0 93.3,25 93.3,75 50,100 6.7,75 6.7,25"
                  fill="none"
                  stroke="rgba(59, 130, 246, 0.15)"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#hexagons)" opacity="0.4" />
          </svg>
        </div>

        {/* Animated pulse rings */}
        <div className="absolute inset-0 overflow-hidden">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="absolute rounded-full border border-blue-400/30"
              style={{
                left: `${50 + Math.sin(time * 0.5 + i) * 5}%`,
                top: `${50 + Math.cos(time * 0.5 + i) * 5}%`,
                width: `${(i + 1) * 20 + Math.sin(time + i) * 10}%`,
                height: `${(i + 1) * 20 + Math.sin(time + i) * 10}%`,
                transform: "translate(-50%, -50%)",
                opacity: 0.2 - i * 0.05,
                animationDelay: `${i * 0.5}s`,
              }}
            />
          ))}
        </div>

        {/* Flowing light beams */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-blue-400/50 to-transparent animate-pulse" />
          <div className="absolute top-0 right-1/3 w-px h-full bg-gradient-to-b from-transparent via-cyan-400/30 to-transparent animate-pulse delay-1000" />
          <div className="absolute top-0 left-2/3 w-px h-full bg-gradient-to-b from-transparent via-blue-300/40 to-transparent animate-pulse delay-2000" />
        </div>

        {/* Neural network nodes */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-3 h-3 bg-blue-400 rounded-full animate-ping" />
          <div className="absolute top-40 right-32 w-4 h-4 bg-cyan-400 rounded-full animate-ping delay-500" />
          <div className="absolute bottom-32 left-1/3 w-3 h-3 bg-blue-300 rounded-full animate-ping delay-1000" />
          <div className="absolute bottom-20 right-20 w-4 h-4 bg-cyan-300 rounded-full animate-ping delay-1500" />
          <div className="absolute top-1/2 left-1/2 w-5 h-5 bg-blue-500 rounded-full animate-ping delay-2000" />
        </div>

        {/* Scanning lines effect */}
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-blue-400/60 to-transparent"
            style={{
              transform: `translateY(${Math.sin(time) * 100 + 100}vh)`,
              opacity: 0.6,
            }}
          />
          <div
            className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent"
            style={{
              transform: `translateY(${-Math.sin(time + Math.PI) * 100 - 100}vh)`,
              opacity: 0.6,
            }}
          />
        </div>
      </div>

      <div className="relative z-10 flex flex-col flex-grow">
        {children}
      </div>
    </div>
  )
}