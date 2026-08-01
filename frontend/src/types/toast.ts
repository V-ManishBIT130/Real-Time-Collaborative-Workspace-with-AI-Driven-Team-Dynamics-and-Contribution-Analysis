export interface ToastNotification {
  id: string;
  userName: string;
  userColor?: string;
  type: 'join' | 'leave' | 'knock';
  message: string;
}
