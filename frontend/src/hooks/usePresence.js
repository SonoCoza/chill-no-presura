import { useState, useEffect } from 'react';
import useSocket from './useSocket';

export default function usePresence() {
  const { socket } = useSocket();
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());

  useEffect(() => {
    if (!socket) return;

    const handleList = ({ onlineUserIds: ids }) => {
      setOnlineUserIds(new Set(ids));
    };

    const handleOnline = ({ userId }) => {
      setOnlineUserIds(prev => new Set([...prev, userId]));
    };

    const handleOffline = ({ userId }) => {
      setOnlineUserIds(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    };

    socket.on('presence:list', handleList);
    socket.on('presence:online', handleOnline);
    socket.on('presence:offline', handleOffline);

    return () => {
      socket.off('presence:list', handleList);
      socket.off('presence:online', handleOnline);
      socket.off('presence:offline', handleOffline);
    };
  }, [socket]);

  const isOnline = (userId) => onlineUserIds.has(userId);

  return { onlineUserIds, isOnline };
}
