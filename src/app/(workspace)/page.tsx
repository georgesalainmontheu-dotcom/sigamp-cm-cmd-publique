'use client';

import { useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { BidderPortalWorkspace } from '../../components/workspaces/BidderPortalWorkspace';
import { CommissionScaWorkspace } from '../../components/workspaces/CommissionScaWorkspace';
import { DisputeWorkspace } from '../../components/workspaces/DisputeWorkspace';
import { FinanceControllerWorkspace } from '../../components/workspaces/FinanceControllerWorkspace';
import { SigampMoWorkspace } from '../../components/workspaces/SigampMoWorkspace';
import type { WorkspaceSpaceId } from '../../lib/ui/demoProfiles';

export default function HomePage() {
  const [activeSpace, setActiveSpace] = useState<WorkspaceSpaceId>('SIGAMP_MO');

  return (
    <AppShell activeSpace={activeSpace} onSelectSpace={setActiveSpace}>
      {({ profile }) => {
        switch (profile.spaceId) {
          case 'SIGAMP_MO':
            return <SigampMoWorkspace profile={profile} />;
          case 'CPM_SCA_ARMP':
            return <CommissionScaWorkspace profile={profile} />;
          case 'FINANCE_CF':
            return <FinanceControllerWorkspace profile={profile} />;
          case 'CONTENTIEUX':
            return <DisputeWorkspace profile={profile} />;
          case 'SOUMISSIONNAIRE':
            return <BidderPortalWorkspace profile={profile} />;
        }
      }}
    </AppShell>
  );
}
