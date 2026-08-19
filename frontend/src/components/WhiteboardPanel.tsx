import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { useSocketEvent, useSocketEmit } from '../hooks/useSocket';
import { useAuthStore } from '../store/useAuthStore';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';

interface WhiteboardPanelProps {
  isReadOnly: boolean;
  initialElements?: any[];
}

function WhiteboardPanelComponent({ isReadOnly, initialElements }: WhiteboardPanelProps) {
  const emit = useSocketEmit();
  const { user } = useAuthStore();
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const isRemoteUpdate = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // Set initial elements once Excalidraw is ready
  useEffect(() => {
    if (isReady && excalidrawAPIRef.current && initialElements && initialElements.length > 0) {
      isRemoteUpdate.current = true;
      excalidrawAPIRef.current.updateScene({
        elements: initialElements
      });
      setTimeout(() => { isRemoteUpdate.current = false; }, 100);
    }
  }, [isReady, initialElements]);

  // Listen for remote whiteboard updates
  useSocketEvent<{ elements: any[]; userId: string }>('whiteboard_update', (data) => {
    if (data.userId === user?._id) return; // Ignore own echoes
    if (!excalidrawAPIRef.current) return;

    isRemoteUpdate.current = true;
    excalidrawAPIRef.current.updateScene({
      elements: data.elements
    });
    // Reset the flag after a short delay to allow the scene update to process
    setTimeout(() => { isRemoteUpdate.current = false; }, 100);
  });

  // Debounced emit on local changes
  const handleChange = useCallback((elements: readonly any[]) => {
    // Don't emit if this change came from a remote update
    if (isRemoteUpdate.current) return;
    if (isReadOnly) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      // Send serializable elements (strip readonly)
      const serializable = elements.map(el => ({ ...el }));
      emit('whiteboard_update', { elements: serializable });
    }, 300);
  }, [emit, isReadOnly]);

  return (
    <div className="whiteboard-container">
      <Excalidraw
        excalidrawAPI={(api) => {
          excalidrawAPIRef.current = api;
          setIsReady(true);
        }}
        onChange={handleChange}
        viewModeEnabled={isReadOnly}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
            export: false,
          },
        }}
        theme="light"
      />
    </div>
  );
}

export default React.memo(WhiteboardPanelComponent);

