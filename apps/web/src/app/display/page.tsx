'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import DisplayView from '../../components/DisplayView';

function DisplayContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || `display-${Math.floor(1000 + Math.random() * 9000)}`;

  return <DisplayView clientId={id} />;
}

export default function DisplayPage() {
  return (
    <Suspense fallback={
      <div className="bg-black text-slate-500 font-mono flex h-screen items-center justify-center text-xs">
        Bootstrapping display interface...
      </div>
    }>
      <DisplayContent />
    </Suspense>
  );
}
