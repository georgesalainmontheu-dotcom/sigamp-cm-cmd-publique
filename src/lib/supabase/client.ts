import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EntityType, RbacRole } from '../../types/domain';
import {
  ROLE_PROFILES,
  type ActiveRoleProfile,
  type WorkspaceSpaceId,
} from '../ui/demoProfiles';

let browserClient: SupabaseClient | null = null;

function readPublicEnv(key: string): string | undefined {
  if (key === 'NEXT_PUBLIC_SUPABASE_URL') {
    return process.env.NEXT_PUBLIC_SUPABASE_URL;
  }
  if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') {
    return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }
  if (key === 'NEXT_PUBLIC_ALLOW_DEMO_ROLE_SWITCHER') {
    return process.env.NEXT_PUBLIC_ALLOW_DEMO_ROLE_SWITCHER;
  }
  return undefined;
}

export function isDemoRoleSwitcherEnabled(): boolean {
  return readPublicEnv('NEXT_PUBLIC_ALLOW_DEMO_ROLE_SWITCHER') === 'true';
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const url = readPublicEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = readPublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !anonKey) return null;

  if (!browserClient) {
    browserClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return browserClient;
}

export async function buildAuthenticatedJsonHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return headers;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // ignore
  }
  return headers;
}

export function setAuthSessionCookie(accessToken: string | null): void {
  if (typeof document === 'undefined') return;
  if (!accessToken) {
    document.cookie = 'sigamp-sb-access-token=; Path=/; Max-Age=0; SameSite=Lax';
    return;
  }
  document.cookie = `sigamp-sb-access-token=${encodeURIComponent(
    accessToken
  )}; Path=/; Max-Age=86400; SameSite=Lax`;
}

export function mapRbacRoleToSpaceId(role: RbacRole): WorkspaceSpaceId {
  switch (role) {
    case 'SIGAMP':
    case 'MO_MOD':
    case 'CHEF_SERVICE_MARCHE':
    case 'INGENIEUR_MARCHE':
    case 'SUPER_ADMIN':
      return 'SIGAMP_MO';
    case 'CPM_PRESIDENT':
    case 'CPM_MEMBRE':
    case 'CPM_SECRETAIRE':
    case 'SCA_RAPPORTEUR':
    case 'SCA_MEMBRE':
    case 'CCCM':
    case 'ARMP_OBSERVATEUR':
    case 'ARMP_REGULATEUR':
    case 'TUTELLE_ETAT':
      return 'CPM_SCA_ARMP';
    case 'CONTROLEUR_FINANCIER':
    case 'RECEVEUR_COMPTABLE':
      return 'FINANCE_CF';
    case 'SOUMISSIONNAIRE':
      return 'SOUMISSIONNAIRE';
    default:
      return 'SIGAMP_MO';
  }
}

export interface EntityMembershipRecord {
  user_id: string;
  entity_id: string;
  role: RbacRole;
  commission_id: string | null;
  active: boolean;
  entities?: {
    id: string;
    code: string;
    name: string;
    type: EntityType;
    municipality: string | null;
  } | null;
}

export async function loadAuthenticatedUserProfiles(
  supabase: SupabaseClient
): Promise<{
  userId: string;
  email: string;
  fullName: string;
  accessToken: string;
  profiles: ActiveRoleProfile[];
} | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session?.user) return null;

  const { data: userCheck, error: userErr } = await supabase.auth.getUser(
    session.access_token
  );
  if (userErr || !userCheck.user) return null;

  const user = userCheck.user;

  const [{ data: profileRow }, { data: memberships }] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('full_name, grade_title')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('entity_memberships')
      .select(
        'user_id, entity_id, role, commission_id, active, entities (id, code, name, type, municipality)'
      )
      .eq('user_id', user.id)
      .eq('active', true),
  ]);

  const fullName =
    (profileRow as { full_name?: string } | null)?.full_name ??
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    'Agent Public';

  const adminTitle =
    (profileRow as { grade_title?: string } | null)?.grade_title ??
    'Agent habilité SIGAMP-CM';

  const typedMemberships = (memberships ?? []) as unknown as EntityMembershipRecord[];

  const profiles: ActiveRoleProfile[] = typedMemberships.map((m) => {
    const spaceId = mapRbacRoleToSpaceId(m.role);
    const template =
      ROLE_PROFILES.find((p) => p.spaceId === spaceId) ?? ROLE_PROFILES[0]!;
    return {
      ...template,
      spaceId,
      roleCode: m.role,
      userId: user.id,
      fullName,
      title: adminTitle,
      entityId: m.entity_id,
      entityCode: m.entities?.code ?? 'ENT-CM',
      entityName: m.entities?.name ?? 'Entité Publique',
      entityType: m.entities?.type ?? 'COMMUNE',
      city: m.entities?.municipality ?? 'Yaoundé',
      fiscalYear: new Date().getFullYear(),
    };
  });

  // Un utilisateur habilité MO_MOD ou ARMP peut aussi accéder à l'espace Contentieux
  const canAccessDisputes = profiles.some((p) =>
    ['SIGAMP', 'MO_MOD', 'ARMP_REGULATEUR', 'CPM_PRESIDENT'].includes(p.roleCode)
  );
  if (canAccessDisputes && !profiles.some((p) => p.spaceId === 'CONTENTIEUX')) {
    const primary = profiles[0]!;
    const disputeTemplate = ROLE_PROFILES.find((p) => p.spaceId === 'CONTENTIEUX')!;
    profiles.push({
      ...disputeTemplate,
      userId: primary.userId,
      fullName: primary.fullName,
      title: primary.title,
      roleCode: primary.roleCode,
      entityId: primary.entityId,
      entityCode: primary.entityCode,
      entityName: primary.entityName,
      entityType: primary.entityType,
      city: primary.city,
      fiscalYear: primary.fiscalYear,
    });
  }

  return {
    userId: user.id,
    email: user.email ?? '',
    fullName,
    accessToken: session.access_token,
    profiles,
  };
}
