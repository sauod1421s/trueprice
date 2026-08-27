"use client";

import { useState } from "react";

type SearchBarProps = {
  search: string;
  setSearch: (value: string) => void;
};

export default function SearchBar({
  search,
  setSearch,
}: SearchBarProps) {
  const [value, setValue] = useState(search);

  const handleSearch = () => {
    setSearch(value.trim());
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSearch();
      }}
      style={{
        display: "flex",
        justifyContent: "center",
        gap: "10px",
        marginTop: "20px",
        flexWrap: "wrap",
      }}
    >
      <input
        type="text"
        placeholder="ابحث عن أي منتج..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{
          width: "500px",
          maxWidth: "100%",
          padding: "15px",
          borderRadius: "12px",
          border: "1px solid #ddd",
          fontSize: "16px",
          direction: "rtl",
          color: "#111",
          background: "#fff",
        }}
      />

      <button
        type="submit"
        style={{
          background: "#16a34a",
          color: "#fff",
          border: "none",
          borderRadius: "12px",
          padding: "15px 25px",
          cursor: "pointer",
          fontSize: "16px",
        }}
      >
        بحث
      </button>
    </form>
  );
}