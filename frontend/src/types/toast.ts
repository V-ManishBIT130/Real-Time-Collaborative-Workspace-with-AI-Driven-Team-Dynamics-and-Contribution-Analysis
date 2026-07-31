export interface ToastNotification {
  id: string;
  userName: string;
  userColor?: string;
  type: 'join' | 'leave';
  message: string;
}
