-- Fix profiles public access - restrict to authenticated users only
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;

CREATE POLICY "Authenticated users can view profiles" 
ON public.profiles FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Fix group_chats missing UPDATE/DELETE policies
-- Allow group creators and admins to update group settings
CREATE POLICY "Creators and admins can update groups"
ON public.group_chats FOR UPDATE
USING (
  auth.uid() = created_by OR
  EXISTS (
    SELECT 1 FROM group_chat_members
    WHERE group_chat_members.group_id = group_chats.id
      AND group_chat_members.user_id = auth.uid()
      AND group_chat_members.role = 'admin'
  )
);

-- Allow creators and admins to delete groups
CREATE POLICY "Creators and admins can delete groups"
ON public.group_chats FOR DELETE
USING (
  auth.uid() = created_by OR
  EXISTS (
    SELECT 1 FROM group_chat_members
    WHERE group_chat_members.group_id = group_chats.id
      AND group_chat_members.user_id = auth.uid()
      AND group_chat_members.role = 'admin'
  )
);

-- Fix group_chat_members missing UPDATE/DELETE policies
-- Allow members to leave groups (delete their own membership)
CREATE POLICY "Members can leave groups"
ON public.group_chat_members FOR DELETE
USING (auth.uid() = user_id);

-- Allow admins to remove other members
CREATE POLICY "Admins can remove members"
ON public.group_chat_members FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM group_chat_members admin_member
    WHERE admin_member.group_id = group_chat_members.group_id
      AND admin_member.user_id = auth.uid()
      AND admin_member.role = 'admin'
  )
  AND group_chat_members.user_id != auth.uid()
);

-- Allow admins to update member roles
CREATE POLICY "Admins can update member roles"
ON public.group_chat_members FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM group_chat_members admin_member
    WHERE admin_member.group_id = group_chat_members.group_id
      AND admin_member.user_id = auth.uid()
      AND admin_member.role = 'admin'
  )
);