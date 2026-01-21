"use client";

type SkeletonListProps = {
  rows?: number;
};

export default function SkeletonList({ rows = 3 }: SkeletonListProps) {
  return (
    <div className="list-stack mt-4">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="skeleton"
          style={{ height: 56, borderRadius: "var(--radius-lg)" }}
        />
      ))}
    </div>
  );
}
