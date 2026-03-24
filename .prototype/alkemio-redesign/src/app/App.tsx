import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { MainLayout } from "./layouts/MainLayout";
import { Dashboard } from "./pages/Dashboard";
import { SpaceHome } from "./pages/SpaceHome";
import { SpaceCommunity } from "./pages/SpaceCommunity";

import { SpaceSubspaces } from "./pages/SpaceSubspaces";
import { SpaceKnowledgeBase } from "./pages/SpaceKnowledgeBase";
import { SpaceSettingsPage } from "./pages/SpaceSettingsPage";
import SubspacePage from "./pages/SubspacePage";

import UserProfilePage from "./pages/UserProfilePage";
import UserAccountPage from "./pages/UserAccountPage";
import UserProfileSettingsPage from "./pages/UserProfileSettingsPage";
import UserMembershipPage from "./pages/UserMembershipPage";
import UserOrganizationsPage from "./pages/UserOrganizationsPage";
import UserNotificationsPage from "./pages/UserNotificationsPage";
import UserGenericSettingsPage from "./pages/UserGenericSettingsPage";
import TemplateLibraryPage from "./pages/TemplateLibraryPage";
import TemplatePackDetailPage from "./pages/TemplatePackDetailPage";
import TemplateDetailPage from "./pages/TemplateDetailPage";
import DesignSystemPage from "./pages/DesignSystemPage";
import CreateSpaceSelectionPage from "./pages/CreateSpaceSelectionPage";
import CreateSpaceChatPage from "./pages/CreateSpaceChatPage";
import EcosystemAnalyticsPage from "./pages/analytics/EcosystemAnalyticsPage";

// Placeholder components for other routes to prevent errors
const Placeholder = ({ title }: { title: string }) => (
  <div className="p-8">
    <h1 className="text-3xl font-bold mb-4">{title}</h1>
    <p className="text-muted-foreground">This page is under construction. Please refer to the design brief.</p>
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/design-system" element={<DesignSystemPage />} />
        <Route path="/create-space/chat" element={<CreateSpaceChatPage />} />
        
        {/* Standalone Analytics App */}
        <Route path="/analytics" element={<EcosystemAnalyticsPage />} />
        
        <Route element={<MainLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/create-space" element={<CreateSpaceSelectionPage />} />
          <Route path="/templates" element={<TemplateLibraryPage />} />
          <Route path="/templates/:templateId" element={<TemplateDetailPage />} />
          <Route path="/templates/packs/:packSlug" element={<TemplatePackDetailPage />} />
          <Route path="/templates/packs/:packSlug/:templateId" element={<TemplateDetailPage />} />
          
          {/* Space Routes */}
          <Route path="/space/:spaceSlug" element={<SpaceHome />} />
          <Route path="/space/:spaceSlug/community" element={<SpaceCommunity />} />
          <Route path="/space/:spaceSlug/subspaces" element={<SpaceSubspaces />} />
          <Route path="/space/:spaceSlug/knowledge-base" element={<SpaceKnowledgeBase />} />
          <Route path="/space/:spaceSlug/knowledge-base" element={<Placeholder title="Space Knowledge Base" />} />
          
          {/* Space Settings Routes */}
          <Route path="/space/:spaceSlug/settings" element={<SpaceSettingsPage />} />
          <Route path="/space/:spaceSlug/settings/:tab" element={<SpaceSettingsPage />} />

          {/* Subspace/Challenge Routes */}
          <Route path="/:spaceSlug/challenges/:subspaceSlug" element={<SubspacePage />} />

          {/* User Routes */}
          <Route path="/user/:userSlug" element={<UserProfilePage />} />
          <Route path="/user/:userSlug/settings/profile" element={<UserProfileSettingsPage />} />
          <Route path="/user/:userSlug/settings/account" element={<UserAccountPage />} />
          <Route path="/user/:userSlug/settings/membership" element={<UserMembershipPage />} />
          <Route path="/user/:userSlug/settings/organizations" element={<UserOrganizationsPage />} />
          <Route path="/user/:userSlug/settings/notifications" element={<UserNotificationsPage />} />
          <Route path="/user/:userSlug/settings/general" element={<UserGenericSettingsPage title="General Settings" />} />
          <Route path="/user/:userSlug/settings/*" element={<UserGenericSettingsPage title="Account Settings" />} />
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
