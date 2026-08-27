export default function Header() {
  return (
    <header
      style={{
        width: "100%",
        background: "#2563eb",
        color: "white",
        boxSizing: "border-box",
        padding: "16px 20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1200px",
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "20px",
          boxSizing: "border-box",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "30px",
            fontWeight: "bold",
            whiteSpace: "nowrap",
          }}
        >
          TruePrice
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: "18px",
            whiteSpace: "nowrap",
          }}
        >
          المرجع الذكي للأسعار
        </p>
      </div>
    </header>
  );
}