import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

interface InputDialogProps {
  title: string;
  placeholder?: string;
  options?: string[];
  onSubmit: (value: string) => void;
  onClose: () => void;
}

const InputDialog: React.FC<InputDialogProps> = ({ title, placeholder, options, onSubmit, onClose }) => {
  const [value, setValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hasOptions = options && options.length > 0;

  const filtered = useMemo(() => {
    if (!options) return [];
    if (!value) return options;
    const q = value.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, value]);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selectedIndex]);

  useEffect(() => {
    if (listRef.current) {
      const item = listRef.current.children[selectedIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleSubmit = useCallback(() => {
    if (hasOptions && filtered.length > 0) {
      onSubmit(filtered[selectedIndex]);
    } else if (value.trim()) {
      onSubmit(value.trim());
    }
  }, [value, hasOptions, filtered, selectedIndex, onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    switch (e.key) {
      case 'ArrowDown':
        if (hasOptions) {
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        }
        break;
      case 'ArrowUp':
        if (hasOptions) {
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
        }
        break;
      case 'Enter':
        handleSubmit();
        break;
      case 'Escape':
        onClose();
        break;
    }
  }, [hasOptions, filtered.length, handleSubmit, onClose]);

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="input-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="input-dialog-title">{title}</div>
        <input
          ref={inputRef}
          className="palette-input"
          type="text"
          placeholder={placeholder || ''}
          value={value}
          onChange={(e) => { setValue(e.target.value); setSelectedIndex(0); }}
          onKeyDown={handleKeyDown}
        />
        {hasOptions && (
          <div className="input-dialog-options" ref={listRef}>
            {filtered.map((opt, index) => (
              <div
                key={opt}
                className={`input-dialog-option${index === selectedIndex ? ' selected' : ''}`}
                onClick={() => onSubmit(opt)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {opt}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="input-dialog-option empty">No matches</div>
            )}
          </div>
        )}
        {!hasOptions && (
          <div className="input-dialog-footer">
            <button className="input-dialog-btn cancel" onClick={onClose}>Cancel</button>
            <button className="input-dialog-btn submit" onClick={handleSubmit}>OK</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InputDialog;
