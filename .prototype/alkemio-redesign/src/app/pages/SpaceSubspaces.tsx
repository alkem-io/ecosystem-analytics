import { useParams } from "react-router";
import { SpaceHeader } from "@/app/components/space/SpaceHeader";
import { SpaceSidebar } from "@/app/components/space/SpaceSidebar";
import { SpaceSubspacesList } from "@/app/components/space/SpaceSubspacesList";
import { SpaceNavigationTabs } from "@/app/components/space/SpaceNavigationTabs";

export function SpaceSubspaces() {
  const { spaceSlug } = useParams<{ spaceSlug: string }>();
  // Provide a fallback if spaceSlug is undefined, though it should be captured by the route
  const slug = spaceSlug || "default-space";

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <SpaceHeader spaceSlug={slug} />
      
      <div className="container mx-auto px-4 md:px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          <SpaceSidebar spaceSlug={slug} />
          
          <div className="flex-1 w-full min-w-0">
            <div className="sticky top-16 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-2 mb-6 -mx-4 px-4 md:mx-0 md:px-0 border-b border-border/50">
               <SpaceNavigationTabs spaceSlug={slug} />
            </div>
            <SpaceSubspacesList />
          </div>
        </div>
      </div>
    </div>
  );
}
