import { useEffect, useRef, useCallback } from 'react';
import { RED_NUMBERS, WHEEL_ORDER } from './rouletteConstants';

export default function RouletteWheel({ phase, winningNumber, spinDurationMs = 7500 }) {
  const canvasRef = useRef(null);
  const rotRef = useRef(0);
  const animRef = useRef(null);
  const spinningRef = useRef(false);
  const phaseRef = useRef(phase);
  const winRef = useRef(winningNumber);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    winRef.current = winningNumber;
  }, [winningNumber]);

  const draw = useCallback((rot) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const OUTER_R = Math.min(W, H) / 2 - 4;
    const INNER_R = OUTER_R - 14;
    const n = WHEEL_ORDER.length;
    const slice = (2 * Math.PI) / n;

    ctx.clearRect(0, 0, W, H);

    ctx.beginPath();
    ctx.arc(cx, cy, OUTER_R + 3, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0a0c';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, OUTER_R + 3, 0, Math.PI * 2);
    ctx.lineWidth = 6;
    const goldRing = ctx.createLinearGradient(cx - OUTER_R, cy, cx + OUTER_R, cy);
    goldRing.addColorStop(0, '#7a5c00');
    goldRing.addColorStop(0.3, '#ffd700');
    goldRing.addColorStop(0.5, '#ffe566');
    goldRing.addColorStop(0.7, '#ffd700');
    goldRing.addColorStop(1, '#7a5c00');
    ctx.strokeStyle = goldRing;
    ctx.stroke();

    WHEEL_ORDER.forEach((num, i) => {
      const startAngle = rot + i * slice - Math.PI / 2;
      const endAngle = startAngle + slice;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, INNER_R, startAngle, endAngle);
      ctx.closePath();

      if (num === 0) {
        ctx.fillStyle = '#0d6632';
      } else if (RED_NUMBERS.includes(num)) {
        ctx.fillStyle = '#7a1515';
      } else {
        ctx.fillStyle = '#111111';
      }
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, INNER_R, startAngle, endAngle);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(212,175,55,0.25)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    });

    WHEEL_ORDER.forEach((num, i) => {
      const startAngle = rot + i * slice - Math.PI / 2;
      const endAngle = startAngle + slice;
      const midAngle = startAngle + slice / 2;

      ctx.beginPath();
      ctx.arc(cx, cy, OUTER_R, startAngle, endAngle);
      ctx.arc(cx, cy, INNER_R + 2, endAngle, startAngle, true);
      ctx.closePath();
      if (num === 0) ctx.fillStyle = '#0d6632';
      else if (RED_NUMBERS.includes(num)) ctx.fillStyle = '#6b1212';
      else ctx.fillStyle = '#181818';
      ctx.fill();

      const x1 = cx + (INNER_R + 2) * Math.cos(startAngle);
      const y1 = cy + (INNER_R + 2) * Math.sin(startAngle);
      const x2 = cx + OUTER_R * Math.cos(startAngle);
      const y2 = cy + OUTER_R * Math.sin(startAngle);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = 'rgba(212,175,55,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const textR = (INNER_R + OUTER_R) / 2;
      const tx = cx + textR * Math.cos(midAngle);
      const ty = cy + textR * Math.sin(midAngle);
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(midAngle + Math.PI / 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(9, INNER_R * 0.063)}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(num), 0, 0);
      ctx.restore();
    });

    const cGrad = ctx.createRadialGradient(cx - 4, cy - 4, 0, cx, cy, INNER_R * 0.18);
    cGrad.addColorStop(0, '#ffe566');
    cGrad.addColorStop(0.4, '#ffd700');
    cGrad.addColorStop(1, '#7a5c00');
    ctx.beginPath();
    ctx.arc(cx, cy, INNER_R * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = cGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(cx + 4 * Math.cos(a), cy + 4 * Math.sin(a));
      ctx.lineTo(cx + INNER_R * 0.17 * Math.cos(a), cy + INNER_R * 0.17 * Math.sin(a));
      ctx.stroke();
    }

    const currentWin = winRef.current;
    const currentPhase = phaseRef.current;

    if (
      (currentPhase === 'RESULT' || currentPhase === 'SPINNING') &&
      currentWin !== null &&
      currentWin !== undefined
    ) {
      const winIdx = WHEEL_ORDER.indexOf(currentWin);
      if (winIdx >= 0) {
        const ballAngle = rot + winIdx * slice - Math.PI / 2 + slice / 2;
        const ballR = OUTER_R - 7;
        const bx = cx + ballR * Math.cos(ballAngle);
        const by = cy + ballR * Math.sin(ballAngle);

        const ballGrad = ctx.createRadialGradient(bx - 2, by - 2, 0, bx, by, 7);
        ballGrad.addColorStop(0, '#ffffff');
        ballGrad.addColorStop(0.6, '#e8e8e8');
        ballGrad.addColorStop(1, '#aaaaaa');

        ctx.beginPath();
        ctx.arc(bx, by, 7, 0, Math.PI * 2);
        ctx.fillStyle = ballGrad;
        ctx.shadowColor = 'rgba(255,255,255,0.8)';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    const arrowY = cy - OUTER_R - 2;
    ctx.beginPath();
    ctx.moveTo(cx, arrowY + 14);
    ctx.lineTo(cx - 9, arrowY + 28);
    ctx.lineTo(cx + 9, arrowY + 28);
    ctx.closePath();
    const arrowGrad = ctx.createLinearGradient(cx, arrowY, cx, arrowY + 28);
    arrowGrad.addColorStop(0, '#ffe566');
    arrowGrad.addColorStop(1, '#b8860b');
    ctx.fillStyle = arrowGrad;
    ctx.shadowColor = 'rgba(255,215,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.arc(cx, arrowY + 12, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd700';
    ctx.fill();
  }, []);

  useEffect(() => {
    if (phase !== 'SPINNING') {
      cancelAnimationFrame(animRef.current);
      spinningRef.current = false;
      draw(rotRef.current);
      return;
    }

    spinningRef.current = true;
    const startRot = rotRef.current;
    const startTime = performance.now();

    let targetRot;
    if (winningNumber !== null && winningNumber !== undefined) {
      const winIdx = WHEEL_ORDER.indexOf(winningNumber);
      const sliceAng = (2 * Math.PI) / WHEEL_ORDER.length;
      const numTurns = 8;
      const winAngle = -winIdx * sliceAng;
      const fullTurns = numTurns * 2 * Math.PI;
      targetRot =
        startRot + fullTurns + ((winAngle - (startRot % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
    } else {
      targetRot = startRot + 10 * 2 * Math.PI;
    }

    const totalDuration = spinDurationMs;

    const animate = (now) => {
      if (!spinningRef.current) return;

      const elapsed = now - startTime;
      const progress = Math.min(elapsed / totalDuration, 1);

      const eased = easeOutCubic(progress);
      const currentRot = startRot + (targetRot - startRot) * eased;

      rotRef.current = currentRot;
      draw(currentRot);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        spinningRef.current = false;
        rotRef.current = targetRot;
        draw(targetRot);
      }
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      spinningRef.current = false;
    };
  }, [phase, winningNumber, spinDurationMs, draw]);

  useEffect(() => {
    if (phase !== 'SPINNING') {
      draw(rotRef.current);
    }
  }, [phase, draw]);

  useEffect(() => {
    if (phase !== 'BETTING' && phase !== 'LAST_CALL' && phase !== 'IDLE') return;

    let lastTime = null;
    const idleSpeed = 0.002;

    const idleAnimate = (now) => {
      if (phase !== 'BETTING' && phase !== 'LAST_CALL' && phase !== 'IDLE') return;
      if (!lastTime) lastTime = now;
      const delta = now - lastTime;
      lastTime = now;
      rotRef.current += idleSpeed * delta;
      draw(rotRef.current);
      animRef.current = requestAnimationFrame(idleAnimate);
    };

    cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(idleAnimate);

    return () => cancelAnimationFrame(animRef.current);
  }, [phase, draw]);

  return (
    <canvas
      ref={canvasRef}
      width={480}
      height={480}
      style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
    />
  );
}

function easeOutCubic(t) {
  const t2 = 1 - t;
  return 1 - t2 * t2 * t2;
}
