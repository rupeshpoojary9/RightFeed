"use client";

export default function DeletePathButton() {
  return (
    <button
      className="ghost danger"
      onClick={(e) => {
        if (!confirm("Delete this path? Your watched videos and notes stay.")) e.preventDefault();
      }}
    >
      Delete path
    </button>
  );
}
