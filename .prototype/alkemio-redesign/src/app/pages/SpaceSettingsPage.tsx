import { useState } from "react";
import { useParams, Outlet, Link, useNavigate, useLocation, Navigate } from "react-router";
import { SpaceSettingsSidebar } from "@/app/components/space/SpaceSettingsSidebar";
import { SpaceSettingsAbout } from "@/app/components/space/SpaceSettingsAbout";
import { SpaceSettingsLayout } from "@/app/components/space/SpaceSettingsLayout";
import { SpaceSettingsCommunity } from "@/app/components/space/SpaceSettingsCommunity";
import { SpaceSettingsSubspaces } from "@/app/components/space/SpaceSettingsSubspaces";
import { SpaceSettingsTemplates } from "@/app/components/space/SpaceSettingsTemplates";
import { SpaceSettingsStorage } from "@/app/components/space/SpaceSettingsStorage";
import { SpaceSettingsSettings } from "@/app/components/space/SpaceSettingsSettings";
import { SpaceSettingsAccount } from "@/app/components/space/SpaceSettingsAccount";
import { Menu, ArrowLeft, LogOut, ChevronRight, Home } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/app/components/ui/sheet";
import { cn } from "@/lib/utils";

export function SpaceSettingsPage() {
  const { spaceSlug, tab } = useParams<{ spaceSlug: string; tab: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // If no tab is provided, redirect to 'about' (or generic 'settings' if preferred, but 'about' is first in list)
  if (!tab && location.pathname.endsWith("/settings")) {
      return <Navigate to={`/space/${spaceSlug}/settings/about`} replace />;
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)] bg-background"> {/* Adjusted height for main layout header if exists */}
      {/* Desktop Sidebar */}
      <SpaceSettingsSidebar className="hidden md:flex sticky top-16 h-[calc(100vh-64px)]" />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-muted/10">

        {/* Page Content */}
        <main className="flex-1 p-6 md:p-8">
          <div className="max-w-6xl mx-auto">
             {/* Content Rendered based on Tab */}
             <div className="bg-card border border-border rounded-xl p-6 md:p-8 shadow-sm min-h-[500px] w-full">
                {tab === 'about' ? (
                    <SpaceSettingsAbout />
                ) : tab === 'layout' ? (
                    <SpaceSettingsLayout />
                ) : tab === 'community' ? (
                    <SpaceSettingsCommunity />
                ) : tab === 'subspaces' ? (
                    <SpaceSettingsSubspaces />
                ) : tab === 'templates' ? (
                    <SpaceSettingsTemplates />
                ) : tab === 'storage' ? (
                    <SpaceSettingsStorage />
                ) : tab === 'settings' ? (
                    <SpaceSettingsSettings />
                ) : tab === 'account' ? (
                    <SpaceSettingsAccount />
                ) : (
                    <div className="flex flex-col justify-center h-full min-h-[300px] space-y-4">
                        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                             <div className="w-8 h-8 bg-muted-foreground/20 rounded-md" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold capitalize">{tab} Settings</h2>
                            <p className="text-muted-foreground max-w-sm">
                                This section is under development. Please check back later for {tab} configuration options.
                            </p>
                        </div>
                    </div>
                )}
             </div>
          </div>
        </main>
      </div>
    </div>
  );
}
