-- Fix RLS policies for missing tables
-- Add policies for permissions table (read-only for authenticated users)
CREATE POLICY "Authenticated users can view permissions"
  ON public.permissions FOR SELECT
  TO authenticated
  USING (true);

-- Add policies for role_permissions table (read-only for authenticated users)
CREATE POLICY "Authenticated users can view role permissions"
  ON public.role_permissions FOR SELECT
  TO authenticated
  USING (true);

-- Add policies for teams table
CREATE POLICY "Users can view teams from their tenant"
  ON public.teams FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage teams in their tenant"
  ON public.teams FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Add policies for team_members table
CREATE POLICY "Users can view team members from their tenant"
  ON public.team_members FOR SELECT
  USING (
    team_id IN (
      SELECT t.id FROM public.teams t
      JOIN public.profiles p ON p.tenant_id = t.tenant_id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage team members in their tenant"
  ON public.team_members FOR ALL
  USING (
    team_id IN (
      SELECT t.id FROM public.teams t
      JOIN public.profiles p ON p.tenant_id = t.tenant_id
      WHERE p.id = auth.uid() AND p.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    team_id IN (
      SELECT t.id FROM public.teams t
      JOIN public.profiles p ON p.tenant_id = t.tenant_id
      WHERE p.id = auth.uid() AND p.role IN ('owner', 'admin')
    )
  );

-- Add policies for invitations table
CREATE POLICY "Users can view invitations from their tenant"
  ON public.invitations FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage invitations in their tenant"
  ON public.invitations FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('owner', 'admin', 'manager')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('owner', 'admin', 'manager')
    )
  );

-- Fix the function search path issue
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;