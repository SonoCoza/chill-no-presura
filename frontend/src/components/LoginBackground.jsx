import { useEffect, useRef } from 'react';

const PARTICLE_COUNT = 55;
const CONNECTION_DISTANCE = 140;

export default function LoginBackground() {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
      canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    };
    resize();
    window.addEventListener('resize', resize);

    const w = () => canvas.offsetWidth;
    const h = () => canvas.offsetHeight;

    // Create particles
    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * w(),
      y: Math.random() * h(),
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      radius: Math.random() * 2 + 1,
      color: Math.random() > 0.6 ? '#b5ff4d' : '#8b5cf6',
      alpha: Math.random() * 0.5 + 0.2,
    }));

    // Background blobs
    const blobs = [
      { x: w() * 0.2, y: h() * 0.3, r: 180, color: 'rgba(181,255,77,0.04)', vx: 0.15, vy: 0.1 },
      { x: w() * 0.7, y: h() * 0.7, r: 220, color: 'rgba(139,92,246,0.05)', vx: -0.1, vy: 0.12 },
      { x: w() * 0.5, y: h() * 0.1, r: 150, color: 'rgba(181,255,77,0.03)', vx: 0.08, vy: 0.15 },
    ];

    // Pulsing orbs
    const pulsingOrbs = [
      { x: 0.15, y: 0.2, r: 120, phase: 0, speed: 0.008, color: 'rgba(181,255,77,' },
      { x: 0.8,  y: 0.7, r: 160, phase: Math.PI, speed: 0.006, color: 'rgba(139,92,246,' },
      { x: 0.5,  y: 0.9, r: 100, phase: Math.PI/2, speed: 0.01, color: 'rgba(181,255,77,' },
    ];

    const animate = () => {
      const cw = w();
      const ch = h();
      ctx.clearRect(0, 0, cw, ch);

      // Draw blobs
      blobs.forEach(blob => {
        blob.x += blob.vx;
        blob.y += blob.vy;
        if (blob.x < -blob.r || blob.x > cw + blob.r) blob.vx *= -1;
        if (blob.y < -blob.r || blob.y > ch + blob.r) blob.vy *= -1;

        const gradient = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.r);
        gradient.addColorStop(0, blob.color);
        gradient.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(blob.x, blob.y, blob.r, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      });

      // Draw pulsing orbs
      pulsingOrbs.forEach(orb => {
        orb.phase += orb.speed;
        const alpha = 0.03 + Math.sin(orb.phase) * 0.02;
        const x = orb.x * cw;
        const y = orb.y * ch;
        const orbGradient = ctx.createRadialGradient(x, y, 0, x, y, orb.r);
        orbGradient.addColorStop(0, orb.color + alpha + ')');
        orbGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = orbGradient;
        ctx.beginPath();
        ctx.arc(x, y, orb.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Move and draw particles
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > cw) p.vx *= -1;
        if (p.y < 0 || p.y > ch) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      // Connection lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < CONNECTION_DISTANCE) {
            const alpha = (1 - dist / CONNECTION_DISTANCE) * 0.15;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(181,255,77,${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="login-canvas" />;
}
