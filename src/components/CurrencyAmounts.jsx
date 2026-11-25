import React from 'react';

// Accept preformatted amounts so each view keeps its existing precision.
export const CurrencyAmounts = ({ afn = 0, usd = 0, className = '' }) => (
    <span className={`currency-amounts ${className}`} dir="ltr">
      {[['AFN', afn], ['USD', usd]].map(([code, value]) => (
        <span className="currency-amount-row" key={code}>
          <span className="currency-code">{code}</span>
          <bdi className="currency-value" dir="ltr">{typeof value === 'number' ? value.toLocaleString('en-US') : value}</bdi>
        </span>
      ))}
    </span>
);
