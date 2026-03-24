import { useState } from "react";
import { useParams } from "react-router";
import { SubspaceHeader } from "@/app/components/space/SubspaceHeader";
import { SubspaceSidebar } from "@/app/components/space/SubspaceSidebar";
import { ChannelTabs } from "@/app/components/space/ChannelTabs";
import { SpaceFeed } from "@/app/components/space/SpaceFeed";

export default function SubspacePage() {
  const { spaceSlug = "innovation-hub", subspaceSlug = "renewable-transition" } = useParams();
  const [activeTab, setActiveTab] = useState("all");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const channels = [
    { id: "all", label: "ALL ACTIVITY" },
    { id: "strategy", label: "STRATEGY DOCS", count: 5 },
    { id: "municipal", label: "MUNICIPAL DATA" },
    { id: "policy", label: "POLICY DRAFTS", count: 2 },
    { id: "stakeholders", label: "STAKEHOLDERS" },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SubspaceHeader 
        spaceSlug={spaceSlug}
        subspaceSlug={subspaceSlug}
        title="Renewable Energy Transition"
        description="Developing strategies for municipal energy transition to 100% renewables by 2030."
        parentSpaceName="Innovation Hub"
        imageUrl="https://images.unsplash.com/photo-1690191863988-f685cddde463?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZXNpZ24lMjBjaGFsbGVuZ2UlMjBjcmVhdGl2ZSUyMHdvcmtzaG9wJTIwdGVhbSUyMGNvbGxhYm9yYXRpb24lMjBpbm5vdmF0aW9uJTIwc3ByaW50JTIwZGVzaWduJTIwc3ByaW50fGVufDF8fHx8MTc2OTA5NDMxMHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
      />

      <main className="flex-1 container mx-auto px-4 py-8 flex gap-8 relative items-start">
        {/* Left Sidebar */}
        <div className={`shrink-0 transition-all duration-300 ${isSidebarCollapsed ? 'w-12' : 'w-80'} hidden md:block sticky top-24 self-start`}>
          <SubspaceSidebar 
            isCollapsed={isSidebarCollapsed} 
            onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
          />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0">
          <div className="sticky top-16 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-4 pb-2 mb-4 -mx-4 px-4 md:mx-0 md:px-0">
            <ChannelTabs 
              tabs={channels} 
              activeTab={activeTab} 
              onTabChange={setActiveTab} 
            />
          </div>
          
          <div className="max-w-3xl">
             <SpaceFeed />
          </div>
        </div>
      </main>
    </div>
  );
}
