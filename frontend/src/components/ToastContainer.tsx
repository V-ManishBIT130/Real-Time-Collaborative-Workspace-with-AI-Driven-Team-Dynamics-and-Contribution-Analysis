import type { ToastNotification } from '../types/toast';
import '../styles/Toast.css';

export type { ToastNotification };

interface Props {
  toasts: ToastNotification[];
  onDismiss: (id: string) => void;
}

export default function ToastContainer({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div className="gmeet-toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`gmeet-toast gmeet-toast-${toast.type}`}>
          <div
            className="gmeet-toast-avatar"
            style={{ background: toast.userColor || '#6366f1' }}
          >
            {toast.userName.charAt(0).toUpperCase()}
          </div>
          <div className="gmeet-toast-content">
            <span className="gmeet-toast-name">{toast.userName}</span>
            <span className="gmeet-toast-action">{toast.message}</span>
          </div>
          <button
            className="gmeet-toast-close"
            onClick={() => onDismiss(toast.id)}
            title="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
