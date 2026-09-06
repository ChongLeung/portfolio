'use client';
import React, { createElement, useEffect } from 'react';
export function MaterialRuntime() { useEffect(() => { import('@material/web/all.js'); }, []); return null; }
type Props = { children?: React.ReactNode; [key: string]: unknown };
export function Md({ tag, children, ...props }: Props & { tag: string }) { return createElement(tag, props, children); }
export function Button({ children, variant = 'tonal', ...props }: Props & { variant?: 'filled' | 'tonal' | 'text' | 'outlined' }) {
 return <Md tag={variant === 'tonal' ? 'md-filled-tonal-button' : `md-${variant}-button`} type="button" {...props}><span className="button-content">{children}</span></Md>;
}
