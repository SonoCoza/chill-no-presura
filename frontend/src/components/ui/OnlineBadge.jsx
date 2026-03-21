import usePresence from '../../hooks/usePresence';
import './OnlineBadge.css';

export default function OnlineBadge({ userId, size = 'md', showLabel = false }) {
  const { isOnline } = usePresence();
  const online = isOnline(userId);

  return (
    <div className={`online-badge online-badge--${size} ${online ? 'is-online' : 'is-offline'}`}>
      <span className="online-dot" />
      {online && <span className="online-ping" />}
      {showLabel && (
        <span className="online-label">{online ? 'Online' : 'Offline'}</span>
      )}
    </div>
  );
}
