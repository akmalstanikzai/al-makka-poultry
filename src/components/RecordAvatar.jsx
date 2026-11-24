import React from 'react';
import { recordTone } from '../lib/recordAppearance';

export const RecordAvatar = ({ id, name, icon: Icon }) => {
    const initials = String(name || '').trim().split(/\s+/).slice(0, 2)
        .map(word => Array.from(word)[0] || '').join('').toLocaleUpperCase();
    return <span className="record-avatar" data-record-tone={recordTone(id || name)} aria-hidden="true">
      {Icon ? <Icon/> : initials || '·'}
    </span>;
};
