-- ============================================
-- USER MANAGEMENT SCHEMA FOR AMAZON SP-API SAAS
-- ============================================
-- This schema extends Supabase Auth with additional user data
-- and implements a complete RBAC (Role-Based Access Control) system

-- ============= USER PROFILES =============
-- Extends Supabase auth.users with additional profile data
CREATE TABLE IF NOT EXISTS public.profiles (
  -- Primary identification
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  
  -- Basic Information
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  full_name TEXT NOT NULL,
  display_name TEXT,
  
  -- Professional Information
  job_title TEXT,
  department TEXT,
  phone TEXT,
  phone_verified BOOLEAN DEFAULT false,
  
  -- Profile Customization
  avatar_url TEXT,
  bio TEXT,
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  language TEXT DEFAULT 'pt-BR',
  date_format TEXT DEFAULT 'DD/MM/YYYY',
  currency TEXT DEFAULT 'BRL',
  
  -- Notification Preferences
  email_notifications BOOLEAN DEFAULT true,
  sms_notifications BOOLEAN DEFAULT false,
  push_notifications BOOLEAN DEFAULT true,
  marketing_emails BOOLEAN DEFAULT false,
  
  -- Security & Access
  role_id TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  two_factor_enabled BOOLEAN DEFAULT false,
  two_factor_secret TEXT,
  last_login_at TIMESTAMP WITH TIME ZONE,
  last_login_ip INET,
  failed_login_attempts INT DEFAULT 0,
  locked_until TIMESTAMP WITH TIME ZONE,
  
  -- Amazon Specific Settings
  default_marketplace_id TEXT,
  default_view TEXT DEFAULT 'dashboard', -- dashboard, products, orders, finance
  preferred_metrics JSONB DEFAULT '["revenue", "orders", "profit", "acos"]'::jsonb,
  
  -- UI Preferences
  theme TEXT DEFAULT 'light', -- light, dark, auto
  sidebar_collapsed BOOLEAN DEFAULT false,
  dashboard_layout JSONB, -- Customizable widget positions
  table_density TEXT DEFAULT 'comfortable', -- comfortable, compact, spacious
  
  -- Metadata
  onboarding_completed BOOLEAN DEFAULT false,
  onboarding_step INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- ============= ROLES =============
-- Define user roles within a tenant
CREATE TABLE IF NOT EXISTS public.roles (
  id TEXT PRIMARY KEY, -- owner, admin, manager, analyst, viewer
  name TEXT NOT NULL,
  description TEXT,
  
  -- Role Hierarchy & Type
  level INT NOT NULL, -- 1=owner, 2=admin, 3=manager, 4=analyst, 5=viewer
  is_system BOOLEAN DEFAULT false, -- System roles cannot be deleted
  is_custom BOOLEAN DEFAULT false, -- Custom roles created by users
  
  -- Default Permissions
  can_manage_billing BOOLEAN DEFAULT false,
  can_manage_users BOOLEAN DEFAULT false,
  can_manage_settings BOOLEAN DEFAULT false,
  can_export_data BOOLEAN DEFAULT false,
  can_delete_data BOOLEAN DEFAULT false,
  
  -- Access Limits (null = unlimited)
  max_api_calls_per_hour INT,
  max_export_rows INT,
  accessible_marketplaces TEXT[], -- null = all
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============= PERMISSIONS =============
-- Granular permissions for features
CREATE TABLE IF NOT EXISTS public.permissions (
  id TEXT PRIMARY KEY, -- e.g., 'products.view', 'orders.edit', 'finance.export'
  resource TEXT NOT NULL, -- products, orders, finance, ads, etc.
  action TEXT NOT NULL, -- view, create, edit, delete, export
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- data, management, billing, settings
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============= ROLE_PERMISSIONS =============
-- Many-to-many relationship between roles and permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id TEXT REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id TEXT REFERENCES public.permissions(id) ON DELETE CASCADE,
  
  -- Permission Modifiers
  is_granted BOOLEAN DEFAULT true,
  conditions JSONB, -- Additional conditions like time restrictions, IP restrictions
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  PRIMARY KEY (role_id, permission_id)
);

-- ============= USER_PERMISSIONS =============
-- Override permissions for specific users
CREATE TABLE IF NOT EXISTS public.user_permissions (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission_id TEXT REFERENCES public.permissions(id) ON DELETE CASCADE,
  
  -- Permission Override
  is_granted BOOLEAN DEFAULT true, -- Can grant or revoke specific permissions
  expires_at TIMESTAMP WITH TIME ZONE, -- Temporary permissions
  granted_by UUID REFERENCES auth.users(id),
  reason TEXT, -- Why this override was created
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  PRIMARY KEY (user_id, permission_id)
);

-- ============= TEAMS =============
-- Group users into teams within a tenant
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  
  -- Team Information
  name TEXT NOT NULL,
  description TEXT,
  color TEXT, -- For UI identification
  icon TEXT, -- Team icon/emoji
  
  -- Team Settings
  is_active BOOLEAN DEFAULT true,
  max_members INT,
  
  -- Team Permissions
  shared_dashboards BOOLEAN DEFAULT true,
  shared_reports BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  
  UNIQUE(tenant_id, name)
);

-- ============= TEAM_MEMBERS =============
-- Users belonging to teams
CREATE TABLE IF NOT EXISTS public.team_members (
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Member Role in Team
  role TEXT DEFAULT 'member', -- leader, member
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  invited_by UUID REFERENCES auth.users(id),
  
  PRIMARY KEY (team_id, user_id)
);

-- ============= INVITATIONS =============
-- Pending invitations to join a tenant
CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  
  -- Invitation Details
  email TEXT NOT NULL,
  role_id TEXT REFERENCES public.roles(id),
  team_id UUID REFERENCES public.teams(id),
  
  -- Invitation Status
  status TEXT DEFAULT 'pending', -- pending, accepted, rejected, expired
  token TEXT UNIQUE NOT NULL, -- Secure invitation token
  
  -- Invitation Metadata
  invited_by UUID REFERENCES auth.users(id),
  accepted_by UUID REFERENCES auth.users(id),
  message TEXT, -- Personal message from inviter
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '7 days',
  accepted_at TIMESTAMP WITH TIME ZONE,
  
  UNIQUE(tenant_id, email)
);

-- ============= ACTIVITY_LOGS =============
-- Audit trail for all user actions
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Activity Information
  action TEXT NOT NULL, -- login, logout, create, update, delete, export, etc.
  resource TEXT NOT NULL, -- user, product, order, settings, etc.
  resource_id TEXT, -- ID of the affected resource
  
  -- Activity Details
  description TEXT,
  metadata JSONB, -- Additional context about the action
  changes JSONB, -- Before/after values for updates
  
  -- Request Information
  ip_address INET,
  user_agent TEXT,
  request_id TEXT,
  
  -- Status
  status TEXT DEFAULT 'success', -- success, failed, partial
  error_message TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============= USER_PREFERENCES =============
-- Store user-specific preferences and settings
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Dashboard Preferences
  default_date_range TEXT DEFAULT '30d', -- 7d, 30d, 90d, 1y, custom
  default_comparison_period TEXT DEFAULT 'previous_period', -- previous_period, previous_year
  favorite_products TEXT[], -- Array of ASINs
  saved_filters JSONB, -- Saved filter configurations
  
  -- Table Preferences
  products_table_columns TEXT[], -- Visible columns in products table
  orders_table_columns TEXT[], -- Visible columns in orders table
  products_per_page INT DEFAULT 25,
  orders_per_page INT DEFAULT 50,
  
  -- Chart Preferences
  chart_animations BOOLEAN DEFAULT true,
  chart_tooltips BOOLEAN DEFAULT true,
  chart_grid_lines BOOLEAN DEFAULT true,
  
  -- Export Preferences
  default_export_format TEXT DEFAULT 'xlsx', -- xlsx, csv, pdf
  include_headers BOOLEAN DEFAULT true,
  
  -- Advanced Settings
  developer_mode BOOLEAN DEFAULT false,
  show_api_responses BOOLEAN DEFAULT false,
  enable_keyboard_shortcuts BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============= API_KEYS =============
-- API keys for programmatic access
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Key Information
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL, -- Hashed API key
  key_prefix TEXT NOT NULL, -- First 7 chars for identification
  description TEXT,
  
  -- Permissions
  permissions TEXT[], -- Specific permissions for this key
  allowed_ips INET[], -- IP whitelist
  allowed_origins TEXT[], -- CORS origins
  
  -- Rate Limiting
  rate_limit_per_hour INT DEFAULT 1000,
  rate_limit_per_day INT DEFAULT 10000,
  
  -- Usage Tracking
  last_used_at TIMESTAMP WITH TIME ZONE,
  last_used_ip INET,
  total_requests INT DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============= SESSIONS =============
-- Active user sessions (beyond Supabase default)
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Session Information
  token_hash TEXT NOT NULL,
  refresh_token_hash TEXT,
  
  -- Device Information
  device_id TEXT,
  device_name TEXT,
  device_type TEXT, -- desktop, mobile, tablet
  browser TEXT,
  os TEXT,
  
  -- Location
  ip_address INET,
  country TEXT,
  city TEXT,
  
  -- Session Status
  is_active BOOLEAN DEFAULT true,
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days'
);

-- ============= INDEXES =============
-- Performance optimization indexes

-- Profiles
CREATE INDEX idx_profiles_tenant_id ON public.profiles(tenant_id);
CREATE INDEX idx_profiles_role_id ON public.profiles(role_id);
CREATE INDEX idx_profiles_is_active ON public.profiles(is_active);
CREATE INDEX idx_profiles_created_at ON public.profiles(created_at);

-- Teams
CREATE INDEX idx_teams_tenant_id ON public.teams(tenant_id);
CREATE INDEX idx_team_members_user_id ON public.team_members(user_id);

-- Activity Logs
CREATE INDEX idx_activity_logs_tenant_id ON public.activity_logs(tenant_id);
CREATE INDEX idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_action ON public.activity_logs(action);
CREATE INDEX idx_activity_logs_resource ON public.activity_logs(resource);

-- API Keys
CREATE INDEX idx_api_keys_tenant_id ON public.api_keys(tenant_id);
CREATE INDEX idx_api_keys_user_id ON public.api_keys(user_id);
CREATE INDEX idx_api_keys_is_active ON public.api_keys(is_active);

-- Sessions
CREATE INDEX idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX idx_user_sessions_is_active ON public.user_sessions(is_active);
CREATE INDEX idx_user_sessions_expires_at ON public.user_sessions(expires_at);

-- Invitations
CREATE INDEX idx_invitations_tenant_id ON public.invitations(tenant_id);
CREATE INDEX idx_invitations_email ON public.invitations(email);
CREATE INDEX idx_invitations_status ON public.invitations(status);
CREATE INDEX idx_invitations_token ON public.invitations(token);

-- ============= DEFAULT ROLES =============
-- Insert default system roles
INSERT INTO public.roles (id, name, description, level, is_system, can_manage_billing, can_manage_users, can_manage_settings, can_export_data, can_delete_data) VALUES
  ('owner', 'Owner', 'Full access to all features and settings', 1, true, true, true, true, true, true),
  ('admin', 'Administrator', 'Manage users and most settings', 2, true, false, true, true, true, true),
  ('manager', 'Manager', 'Manage products, orders, and view reports', 3, true, false, false, false, true, false),
  ('analyst', 'Analyst', 'View and analyze data, create reports', 4, true, false, false, false, true, false),
  ('viewer', 'Viewer', 'View-only access to dashboards and reports', 5, true, false, false, false, false, false)
ON CONFLICT (id) DO NOTHING;

-- ============= DEFAULT PERMISSIONS =============
-- Insert default permissions for all resources
INSERT INTO public.permissions (id, resource, action, name, description, category) VALUES
  -- Products
  ('products.view', 'products', 'view', 'View Products', 'View product listings and details', 'data'),
  ('products.create', 'products', 'create', 'Create Products', 'Add new products', 'data'),
  ('products.edit', 'products', 'edit', 'Edit Products', 'Modify product information', 'data'),
  ('products.delete', 'products', 'delete', 'Delete Products', 'Remove products', 'data'),
  ('products.export', 'products', 'export', 'Export Products', 'Export product data', 'data'),
  
  -- Orders
  ('orders.view', 'orders', 'view', 'View Orders', 'View order listings and details', 'data'),
  ('orders.edit', 'orders', 'edit', 'Edit Orders', 'Modify order information', 'data'),
  ('orders.export', 'orders', 'export', 'Export Orders', 'Export order data', 'data'),
  
  -- Finance
  ('finance.view', 'finance', 'view', 'View Finance', 'View financial reports', 'data'),
  ('finance.export', 'finance', 'export', 'Export Finance', 'Export financial data', 'data'),
  
  -- Advertising
  ('ads.view', 'ads', 'view', 'View Advertising', 'View advertising campaigns and metrics', 'data'),
  ('ads.edit', 'ads', 'edit', 'Edit Advertising', 'Modify advertising campaigns', 'data'),
  ('ads.create', 'ads', 'create', 'Create Campaigns', 'Create new advertising campaigns', 'data'),
  
  -- Settings
  ('settings.view', 'settings', 'view', 'View Settings', 'View system settings', 'settings'),
  ('settings.edit', 'settings', 'edit', 'Edit Settings', 'Modify system settings', 'settings'),
  
  -- Users
  ('users.view', 'users', 'view', 'View Users', 'View user listings', 'management'),
  ('users.create', 'users', 'create', 'Create Users', 'Add new users', 'management'),
  ('users.edit', 'users', 'edit', 'Edit Users', 'Modify user information', 'management'),
  ('users.delete', 'users', 'delete', 'Delete Users', 'Remove users', 'management'),
  
  -- Billing
  ('billing.view', 'billing', 'view', 'View Billing', 'View billing information', 'billing'),
  ('billing.edit', 'billing', 'edit', 'Edit Billing', 'Modify billing settings', 'billing')
ON CONFLICT (id) DO NOTHING;

-- ============= ROLE PERMISSIONS MAPPING =============
-- Map permissions to roles
INSERT INTO public.role_permissions (role_id, permission_id) 
SELECT 'owner', id FROM public.permissions
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id) 
SELECT 'admin', id FROM public.permissions 
WHERE id NOT LIKE 'billing.edit'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id) VALUES
  -- Manager role
  ('manager', 'products.view'),
  ('manager', 'products.create'),
  ('manager', 'products.edit'),
  ('manager', 'products.export'),
  ('manager', 'orders.view'),
  ('manager', 'orders.edit'),
  ('manager', 'orders.export'),
  ('manager', 'finance.view'),
  ('manager', 'ads.view'),
  ('manager', 'ads.edit'),
  
  -- Analyst role  
  ('analyst', 'products.view'),
  ('analyst', 'products.export'),
  ('analyst', 'orders.view'),
  ('analyst', 'orders.export'),
  ('analyst', 'finance.view'),
  ('analyst', 'finance.export'),
  ('analyst', 'ads.view'),
  
  -- Viewer role
  ('viewer', 'products.view'),
  ('viewer', 'orders.view'),
  ('viewer', 'finance.view'),
  ('viewer', 'ads.view')
ON CONFLICT DO NOTHING;

-- ============= ROW LEVEL SECURITY (RLS) =============
-- Enable RLS for all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Profiles: Users can view profiles in their tenant
CREATE POLICY "Users can view profiles in their tenant" ON public.profiles
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

-- Profiles: Users can update their own profile
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- Teams: Users can view teams in their tenant
CREATE POLICY "Users can view teams in their tenant" ON public.teams
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

-- Activity logs: Users can view logs in their tenant
CREATE POLICY "Users can view activity logs in their tenant" ON public.activity_logs
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

-- ============= TRIGGERS =============
-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============= FUNCTIONS =============
-- Function to check if user has permission
CREATE OR REPLACE FUNCTION check_user_permission(
  p_user_id UUID,
  p_permission_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  has_permission BOOLEAN;
BEGIN
  -- Check role permissions
  SELECT EXISTS (
    SELECT 1 
    FROM public.profiles p
    JOIN public.role_permissions rp ON p.role_id = rp.role_id
    WHERE p.id = p_user_id 
    AND rp.permission_id = p_permission_id
    AND rp.is_granted = true
  ) INTO has_permission;
  
  -- Check user-specific permissions (overrides)
  IF NOT has_permission THEN
    SELECT EXISTS (
      SELECT 1 
      FROM public.user_permissions up
      WHERE up.user_id = p_user_id
      AND up.permission_id = p_permission_id
      AND up.is_granted = true
      AND (up.expires_at IS NULL OR up.expires_at > NOW())
    ) INTO has_permission;
  END IF;
  
  RETURN has_permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log user activity
CREATE OR REPLACE FUNCTION log_user_activity(
  p_tenant_id TEXT,
  p_user_id UUID,
  p_action TEXT,
  p_resource TEXT,
  p_resource_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO public.activity_logs (
    tenant_id, user_id, action, resource, resource_id, 
    description, metadata, created_at
  ) VALUES (
    p_tenant_id, p_user_id, p_action, p_resource, p_resource_id,
    p_description, p_metadata, NOW()
  ) RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;