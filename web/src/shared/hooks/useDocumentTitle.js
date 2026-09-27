import { useEffect } from 'react';

/**
 * Custom hook to dynamically set the document title for improved in-app UX.
 * @param {string} title
 */
export function useDocumentTitle(title) {
  useEffect(() => {
    if (!title) return;
    const prevTitle = document.title;
    document.title = title;
    return () => {
      document.title = prevTitle;
    };
  }, [title]);
}
