import React, { useState, useRef, useEffect } from 'react';
import { FiSend, FiMessageSquare, FiUser, FiCpu, FiChevronDown } from 'react-icons/fi';
import styles from './ChatPanel.module.css';

export default function ChatPanel({ width }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi! I'm Foundry AI, your coding assistant. Ask me anything about your code, and I'll help you out.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      const responses = [
        "I can see you're working on that. Let me analyze the code structure and suggest some improvements.",
        "That's a great approach! You might also want to consider adding error handling for edge cases.",
        "I'd recommend breaking this into smaller functions for better readability and testability.",
        "Looking at the pattern here, you could use a more declarative approach. Want me to show you an example?",
        "Good question! The key thing to understand is how the data flows through these components.",
      ];
      const aiMsg = {
        role: 'assistant',
        content: responses[Math.floor(Math.random() * responses.length)],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, aiMsg]);
      setIsTyping(false);
    }, 1200);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles.panel} style={{ width }}>
      <div className={styles.header}>
        <FiMessageSquare size={14} />
        <span className={styles.headerTitle}>Chat</span>
        <div className={styles.modelBadge}>
          <FiCpu size={11} />
          <span>Foundry AI</span>
        </div>
      </div>

      <div className={styles.messages}>
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`${styles.message} ${msg.role === 'user' ? styles.messageUser : styles.messageAssistant}`}
          >
            <div className={styles.messageHeader}>
              <div className={`${styles.messageAvatar} ${msg.role === 'user' ? styles.avatarUser : styles.avatarAi}`}>
                {msg.role === 'user' ? <FiUser size={12} /> : <FiCpu size={12} />}
              </div>
              <span className={styles.messageRole}>
                {msg.role === 'user' ? 'You' : 'Foundry AI'}
              </span>
              <span className={styles.messageTime}>{msg.timestamp}</span>
            </div>
            <div className={styles.messageContent}>
              {msg.content}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className={`${styles.message} ${styles.messageAssistant}`}>
            <div className={styles.messageHeader}>
              <div className={`${styles.messageAvatar} ${styles.avatarAi}`}>
                <FiCpu size={12} />
              </div>
              <span className={styles.messageRole}>Foundry AI</span>
            </div>
            <div className={styles.typing}>
              <span className={styles.typingDot} />
              <span className={styles.typingDot} />
              <span className={styles.typingDot} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <textarea
            ref={inputRef}
            className={styles.input}
            placeholder="Ask Foundry AI..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={!input.trim()}
          >
            <FiSend size={14} />
          </button>
        </div>
        <div className={styles.inputHint}>
          <kbd className={styles.kbd}>Enter</kbd>
          <span>to send</span>
          <kbd className={styles.kbd}>Shift+Enter</kbd>
          <span>new line</span>
        </div>
      </div>
    </div>
  );
}
