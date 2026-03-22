import { useEffect, useRef } from 'react';

const NUMBERS = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export default function RouletteWheel({ spinning, winningNumber, onSpinEnd }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const rotationRef = useRef(0);
  const targetRotationRef = useRef(null);
  const isSpinningRef = useRef(false);

  const drawWheel = (rotation) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(W, H) / 2 - 10;
    const sliceAngle = (2 * Math.PI) / NUMBERS.length;

    ctx.clearRect(0, 0, W, H);

    // Sfondo ruota
    ctx.beginPath();
    ctx.arc(cx, cy, R + 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#1a0a00';
    ctx.fill();

    // Settori
    NUMBERS.forEach((num, i) => {
      const startAngle = rotation + i * sliceAngle - Math.PI / 2;
      const endAngle = startAngle + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, startAngle, endAngle);
      ctx.closePath();

      if (num === 0) {
        ctx.fillStyle = '#1a7a3a';
      } else if (RED_NUMBERS.includes(num)) {
        ctx.fillStyle = '#c62828';
      } else {
        ctx.fillStyle = '#1a1a1a';
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,215,0,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Numero
      const midAngle = startAngle + sliceAngle / 2;
      const textR = R * 0.78;
      const tx = cx + textR * Math.cos(midAngle);
      const ty = cy + textR * Math.sin(midAngle);
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(midAngle + Math.PI / 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${R * 0.06}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(num), 0, 0);
      ctx.restore();
    });

    // Centro
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.12, 0, 2 * Math.PI);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.12);
    grad.addColorStop(0, '#ffd700');
    grad.addColorStop(1, '#b8860b');
    ctx.fillStyle = grad;
    ctx.fill();

    // Pallina se risultato
    if (!isSpinningRef.current && winningNumber !== null && winningNumber !== undefined) {
      const winIdx = NUMBERS.indexOf(winningNumber);
      if (winIdx >= 0) {
        const angle = rotation + winIdx * sliceAngle - Math.PI / 2 + sliceAngle / 2;
        const ballR = R * 0.88;
        const bx = cx + ballR * Math.cos(angle);
        const by = cy + ballR * Math.sin(angle);
        ctx.beginPath();
        ctx.arc(bx, by, R * 0.04, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(255,255,255,0.8)';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Freccia indicatore (in cima)
    ctx.beginPath();
    ctx.moveTo(cx, cy - R - 6);
    ctx.lineTo(cx - 8, cy - R + 10);
    ctx.lineTo(cx + 8, cy - R + 10);
    ctx.closePath();
    ctx.fillStyle = '#ffd700';
    ctx.fill();
  };

  useEffect(() => {
    drawWheel(rotationRef.current);
  }, [winningNumber]);

  useEffect(() => {
    if (!spinning) {
      isSpinningRef.current = false;
      cancelAnimationFrame(animRef.current);
      return;
    }

    isSpinningRef.current = true;

    if (winningNumber !== null && winningNumber !== undefined) {
      const winIdx = NUMBERS.indexOf(winningNumber);
      const sliceAngle = (2 * Math.PI) / NUMBERS.length;
      const extraRotations = 6 * 2 * Math.PI;
      const targetAngle = extraRotations + (NUMBERS.length - winIdx) * sliceAngle;
      targetRotationRef.current = rotationRef.current + targetAngle;
    } else {
      targetRotationRef.current = null;
    }

    const startTime = performance.now();
    const spinDuration = 7500;
    const startRotation = rotationRef.current;

    const animate = (time) => {
      if (!isSpinningRef.current) return;

      const elapsed = time - startTime;
      const progress = Math.min(elapsed / spinDuration, 1);

      let currentRotation;
      if (targetRotationRef.current !== null) {
        const eased = easeInOutCubic(progress);
        currentRotation = startRotation + (targetRotationRef.current - startRotation) * eased;
      } else {
        currentRotation = startRotation + progress * 20;
      }

      rotationRef.current = currentRotation;
      drawWheel(currentRotation);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        isSpinningRef.current = false;
        onSpinEnd && onSpinEnd();
      }
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [spinning]);

  return (
    <canvas
      ref={canvasRef}
      width={460}
      height={460}
      className="roulette-canvas"
    />
  );
}
