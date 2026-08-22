export interface ToastNotification {
  id: string;
  userName: string;
  userColor?: string;
  type: 'join' | 'leave' | 'knock' | 'error';
  message: string;
}
