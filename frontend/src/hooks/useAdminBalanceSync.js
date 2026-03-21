import { useEffect, useCallback, useRef } from 'react';
import useSocket from './useSocket';

/**
 * Hook for admin panel: listens for admin:balance_updated events
 * and calls onBalanceUpdate({ userId, newBalance, delta, type }) in real-time.
 */
export default function useAdminBalanceSync(onBalanceUpdate) {
  const { socket } = useSocket();
  const callbackRef = useRef(onBalanceUpdate);
  callbackRef.current = onBalanceUpdate;

  useEffect(() => {
    if (!socket) return;

    const handler = (data) => {
      if (callbackRef.current) callbackRef.current(data);
    };

    socket.on('admin:balance_updated', handler);
    return () => socket.off('admin:balance_updated', handler);
  }, [socket]);
}
