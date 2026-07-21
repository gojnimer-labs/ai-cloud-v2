import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Center } from "@astryxdesign/core/Center";
import { Icon } from "@astryxdesign/core/Icon";
import { PhotoIcon } from "@heroicons/react/24/outline";

// A full-bleed square gallery image for card grids (PresetItem/WorkloadCard).
// Astryx's Thumbnail component is a compact, hard-coded 64px square (its own
// stylesheet fixes width:64px — meant for chat/file-attachment previews, not
// resizable), so it's the wrong tool for a card's hero image. This mirrors
// astryx's own OverlayBottomStrip/product-gallery templates instead:
// AspectRatio + <img>, with a simple placeholder icon when there's no image.
export const GalleryThumbnail = ({
  alt,
  src,
}: {
  alt: string;
  src: string | null;
}) => (
  <AspectRatio
    ratio={1}
    style={{ borderRadius: "var(--radius-container)", overflow: "clip" }}
  >
    {src ? (
      <img
        alt={alt}
        src={src}
        style={{ height: "100%", objectFit: "cover", width: "100%" }}
      />
    ) : (
      <Center
        axis="both"
        style={{
          backgroundColor: "var(--color-background-muted)",
          height: "100%",
          width: "100%",
        }}
      >
        <Icon color="secondary" icon={PhotoIcon} size="lg" />
      </Center>
    )}
  </AspectRatio>
);
