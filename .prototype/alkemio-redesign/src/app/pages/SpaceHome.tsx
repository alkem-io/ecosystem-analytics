import { useParams } from "react-router";
import { SpaceHeader } from "@/app/components/space/SpaceHeader";
import { SpaceSidebar } from "@/app/components/space/SpaceSidebar";
import { SpaceFeed } from "@/app/components/space/SpaceFeed";
import { SpaceNavigationTabs } from "@/app/components/space/SpaceNavigationTabs";

export function SpaceHome() {
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
            <div className="sticky top-16 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-4 pb-2 mb-4 -mx-4 px-4 md:mx-0 md:px-0">
               <SpaceNavigationTabs spaceSlug={slug} />
            </div>
            <SpaceFeed />
          </div>
        </div>
      </div>
    </div>
  );
}
