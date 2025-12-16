import React, { useState, useRef } from 'react';
import type { Theme, Session, Group } from '../types';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { Modal, ModalFooter, EmojiPickerField, FormInput } from './ui';

interface CreateGroupModalProps {
  theme: Theme;
  onClose: () => void;
  groups: Group[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  sessions: Session[];
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  activeSessionId: string;
  moveSessionToNewGroup: boolean;
  setMoveSessionToNewGroup: (move: boolean) => void;
}

export function CreateGroupModal(props: CreateGroupModalProps) {
  const {
    theme, onClose, groups, setGroups, sessions, setSessions,
    activeSessionId, moveSessionToNewGroup, setMoveSessionToNewGroup
  } = props;

  const [groupName, setGroupName] = useState('');
  const [groupEmoji, setGroupEmoji] = useState('📂');

  const inputRef = useRef<HTMLInputElement>(null);

  const handleCreate = () => {
    if (groupName.trim()) {
      const newGroup: Group = {
        id: `group-${Date.now()}`,
        name: groupName.trim().toUpperCase(),
        emoji: groupEmoji,
        collapsed: false
      };
      setGroups([...groups, newGroup]);

      // If we should move the session to the new group
      if (moveSessionToNewGroup) {
        setSessions(prev => prev.map(s =>
          s.id === activeSessionId ? { ...s, groupId: newGroup.id } : s
        ));
      }

      setGroupName('');
      setGroupEmoji('📂');
      setMoveSessionToNewGroup(false);
      onClose();
    }
  };

  return (
    <Modal
      theme={theme}
      title="Create New Group"
      priority={MODAL_PRIORITIES.CREATE_GROUP}
      onClose={onClose}
      initialFocusRef={inputRef}
      footer={
        <ModalFooter
          theme={theme}
          onCancel={onClose}
          onConfirm={handleCreate}
          confirmLabel="Create"
          confirmDisabled={!groupName.trim()}
        />
      }
    >
      <div className="flex gap-4 items-end">
        {/* Emoji Selector - Left Side */}
        <EmojiPickerField
          theme={theme}
          value={groupEmoji}
          onChange={setGroupEmoji}
          restoreFocusRef={inputRef}
        />

        {/* Group Name Input - Right Side */}
        <div className="flex-1">
          <FormInput
            ref={inputRef}
            theme={theme}
            label="Group Name"
            value={groupName}
            onChange={setGroupName}
            onSubmit={groupName.trim() ? handleCreate : undefined}
            placeholder="Enter group name..."
            heightClass="h-[52px]"
            autoFocus
          />
        </div>
      </div>
    </Modal>
  );
}
