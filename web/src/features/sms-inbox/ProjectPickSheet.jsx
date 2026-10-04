/**
 * ProjectPickSheet.jsx — «ثبت در یک پروژه»: which project (expense section) a bank withdrawal goes to
 *
 * The open projects are listed; picking one opens the expense form for it, filled in from the
 * message (SmsInboxPage). Without a project, a link to make one on the expenses page.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, ChevronLeft, Plus } from 'lucide-react';
import { Button, EmptyState, Modal } from '../../shared/ui/index.js';
import { SkeletonRows } from '../../shared/ui/Skeleton.jsx';
import { appPath } from '../../shared/routes.js';
import * as expensesApi from '../../shared/vault/vaultExpenses.js';
import { formatAmount } from '../expenses/utils/format.js';

export default function ProjectPickSheet({ item, onPick, onClose }) {
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, projects: [] });
  useEffect(() => {
    let cancelled = false;
    expensesApi.getExpenseGroups()
      .then(({ groups }) => !cancelled && setState({ loading: false, projects: groups.filter((g) => g.type !== 'daily' && !g.archived) }))
      .catch(() => !cancelled && setState({ loading: false, projects: [] }));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="ثبت در یک پروژه"
      subtitle={`${formatAmount(item.tx.amount)} تومان — در کدام پروژه ثبت شود؟`}
      icon={<FolderOpen size={18} />}
      maxWidth="460px"
    >
      <div className="loan-deposit-body">
        {state.loading ? (
          <SkeletonRows rows={3} columns={2} label="در حال دریافت پروژه‌ها" />
        ) : state.projects.length === 0 ? (
          <EmptyState
            icon={<FolderOpen size={36} strokeWidth={1.5} />}
            title="پروژه‌ای ندارید"
            description="در صفحه‌ی هزینه‌ها، بخش «پروژه‌ها»، یک پروژه (مثلاً سفر یا تعمیر خانه) بسازید."
            action={(
              <Button icon={<Plus size={16} />} onClick={() => { onClose(); navigate(appPath('/projects')); }}>
                ساخت پروژه
              </Button>
            )}
          />
        ) : (
          <ul className="loan-deposit-list">
            {state.projects.map((project) => (
              <li key={project.id}>
                <button type="button" className="loan-deposit-option" onClick={() => onPick(project)}>
                  <FolderOpen size={16} />
                  <span>
                    <strong>{project.name}</strong>
                    {project.notes && <small>{project.notes}</small>}
                  </span>
                  <ChevronLeft size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
