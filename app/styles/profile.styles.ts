import { StyleSheet } from "react-native";
export const BRAND = "#942229";
const CREAM = "#F4EFEA";
const GRAY = "#666";

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "transparent" },
  bg: { flex: 1, padding: 20, justifyContent: "center" },
  bgImage: { opacity: 0.28, resizeMode: "cover" },
  content: {
    flexGrow: 1,
    paddingVertical: 24,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: CREAM,
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: BRAND,
    textAlign: "center",
  },
  subtitle: {
    color: GRAY,
    marginTop: 6,
    marginBottom: 18,
    fontSize: 14,
    textAlign: "center",
  },
  formGroup: {
    gap: 6,
    marginBottom: 14,
  },
  label: {
    fontWeight: "600",
    color: "#222",
  },
  input: {
    borderBottomWidth: 1,
    borderColor: "#ccc",
    paddingVertical: 12,
    fontSize: 16,
    color: "#111",
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: "#ccc",
  },
  eyeBtn: {
    position: "absolute",
    right: 4,
    top: 8,
    padding: 8,
  },
  eyeImg: {
    width: 22,
    height: 22,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#C7BFB5",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  checkboxBoxChecked: {
    backgroundColor: BRAND,
    borderColor: BRAND,
  },
  checkboxMark: {
    color: "#fff",
    fontWeight: "800",
  },
  checkboxText: {
    flex: 1,
    color: "#333",
  },
  message: {
    marginTop: 4,
    color: BRAND,
  },
  row: { alignItems: "flex-end", marginTop: 6, marginBottom: 16 },
  link: { color: BRAND, fontWeight: "700" },
  button: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: BRAND,
  },
  primaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
  secondaryBtn: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: BRAND,
  },
  secondaryText: {
    color: BRAND,
    fontWeight: "700",
  },
});
