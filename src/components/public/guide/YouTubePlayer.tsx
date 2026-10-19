"use client";

import { useState } from "react";
import { Play } from "lucide-react";

interface YouTubePlayerProps {
  id: string;
  title: string;
  /** Read by screen readers on the play button. */
  playLabel: string;
  locale: string;
  portrait?: boolean;
}

/**
 * A guide video, loaded only when the visitor asks for it.
 *
 * Until the click, this is a thumbnail and a button: nothing is fetched from
 * YouTube but the image, so the page sets no third-party cookie and needs no
 * consent banner, and a visitor on a phone connection does not download a
 * player they may never start. The player itself comes from
 * youtube-nocookie.com, and `rel=0` keeps the suggestions at the end to this
 * channel's own videos.
 */
export function YouTubePlayer({ id, title, playLabel, locale, portrait }: YouTubePlayerProps) {
  const [playing, setPlaying] = useState(false);
  const frame = portrait
    ? "aspect-9/16 max-w-sm mx-auto"
    : "aspect-video w-full";

  if (playing) {
    const params = new URLSearchParams({
      autoplay: "1",
      rel: "0",
      modestbranding: "1",
      hl: locale,
      cc_lang_pref: locale,
    });
    return (
      <div className={`${frame} overflow-hidden rounded-xl bg-black shadow-lg`}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?${params}`}
          title={title}
          className="h-full w-full"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={playLabel}
      className={`${frame} group relative block overflow-hidden rounded-xl bg-gray-900 shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a remote thumbnail, shown once */}
      <img
        src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
      />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-600 text-white shadow-xl transition-transform group-hover:scale-105">
          <Play className="h-7 w-7 translate-x-0.5" fill="currentColor" />
        </span>
      </span>
    </button>
  );
}
