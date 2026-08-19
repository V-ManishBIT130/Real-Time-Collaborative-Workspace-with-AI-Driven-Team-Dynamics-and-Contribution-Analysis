import React, { useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useSocketEvent, useSocketEmit } from '../hooks/useSocket';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';

const LANGUAGES = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'plaintext', label: 'Plain Text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
];

interface CodeEditorPanelProps {
  isReadOnly: boolean;
  initialContent?: string;
  initialLanguage?: string;
}

function CodeEditorPanelComponent({ isReadOnly, initialContent, initialLanguage }: CodeEditorPanelProps) {
  const emit = useSocketEmit();
  const { user } = useAuthStore();
  const { codeLanguage, setCodeLanguage } = useAppStore();
  const isRemoteUpdate = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  // Initialize language from props
  const activeLanguage = initialLanguage || codeLanguage;

  // Listen for remote code updates
  useSocketEvent<{ content: string; language: string; userId: string }>('code_update', (data) => {
    if (data.userId === user?._id) return;
    if (!editorRef.current) return;

    isRemoteUpdate.current = true;
    const editor = editorRef.current;

    // Preserve cursor position
    const position = editor.getPosition();
    editor.setValue(data.content || '');
    if (position) editor.setPosition(position);

    setTimeout(() => { isRemoteUpdate.current = false; }, 100);
  });

  // Listen for language changes from other participants
  useSocketEvent<{ language: string; changedBy: string }>('code_language_changed', (data) => {
    setCodeLanguage(data.language);
    if (monacoRef.current && editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        monacoRef.current.editor.setModelLanguage(model, data.language);
      }
    }
  });

  // Handle local code changes — debounced emit
  const handleChange = useCallback((value: string | undefined) => {
    if (isRemoteUpdate.current) return;
    if (isReadOnly) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      emit('code_update', { content: value || '', language: activeLanguage });
    }, 300);
  }, [emit, isReadOnly, activeLanguage]);

  // Handle language selector change
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value;
    setCodeLanguage(newLang);
    emit('code_language_change', { language: newLang });
  };

  // Handle editor mount
  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Set initial content if provided
    if (initialContent && !editor.getValue()) {
      isRemoteUpdate.current = true;
      editor.setValue(initialContent);
      setTimeout(() => { isRemoteUpdate.current = false; }, 100);
    }
  };

  return (
    <div className="code-editor-container">
      <div className="code-editor-toolbar">
        <div className="toolbar-left">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
          </svg>
          <span className="toolbar-label">Code Editor</span>
        </div>
        <div className="toolbar-right">
          <select
            className="language-select"
            value={activeLanguage}
            onChange={handleLanguageChange}
            disabled={isReadOnly}
          >
            {LANGUAGES.map(lang => (
              <option key={lang.value} value={lang.value}>{lang.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="monaco-wrapper">
        <Editor
          height="100%"
          language={activeLanguage}
          defaultValue={initialContent || '# Notes\n\nStart writing your ideas and notes here...\n'}
          theme="vs-dark"
          onChange={handleChange}
          onMount={handleEditorMount}
          options={{
            readOnly: isReadOnly,
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            lineNumbers: 'on',
            tabSize: 2,
            wordWrap: 'on',
            automaticLayout: true,
            scrollBeyondLastLine: false,
            renderWhitespace: 'selection',
            bracketPairColorization: { enabled: true },
            cursorBlinking: 'smooth',
            smoothScrolling: true,
            padding: { top: 12, bottom: 12 },
          }}
        />
      </div>
    </div>
  );
}

export default React.memo(CodeEditorPanelComponent);

