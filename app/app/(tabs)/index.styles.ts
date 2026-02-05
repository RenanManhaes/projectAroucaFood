import { StyleSheet } from 'react-native';

const BRAND = "#942229";

export const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
  container: {
    flex: 1,
    backgroundColor: "#F7F5F2",
  },
  headerSafe: {
    backgroundColor: BRAND,
  },
  header: {
    width: "100%",
    height: 90,
    backgroundColor: BRAND,
    justifyContent: "center",
    alignItems: "center",
  },
  headerLogo: {
    width: 600,
    height: 60,
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  searchWrap: {
    marginTop: 8,
  },
  search: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#E7E2DA",
    fontSize: 16,
    color: "#111",
  },
  cartInfoRow: {
    marginTop: 10,
    marginBottom: 4,
  },
  cartInfo: {
    fontSize: 14,
    color: "#222",
    fontWeight: "700",
  },
  cartMessage: {
    marginTop: 4,
    color: BRAND,
    fontSize: 13,
    fontWeight: "700",
  },
  sectionHeader: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    marginVertical: 8,
  },
  sectionTitle: {
    marginTop: 18,
    fontSize: 20,
    fontWeight: "800",
    color: "#111",
  },
  link: {
    color: BRAND,
    fontWeight: "700",
  },
  categoriesRow: {
    flexDirection: "row",
    marginTop: 10,
    paddingRight: 8,
  },
  categoryChip: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E7E2DA",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
  },
  categoryChipSelected: {
    backgroundColor: BRAND,
    borderColor: BRAND,
  },
  categoryChipText: {
    fontWeight: "700",
    color: "#222",
  },
  categoryChipTextSelected: {
    color: "#fff",
  },
  loadingText: {
    textAlign: "center",
    marginVertical: 24,
  },
  errorText: {
    color: "#b00020",
    marginVertical: 8,
    textAlign: "center",
  },
  emptyText: {
    textAlign: "center",
    marginVertical: 24,
    color: "#555",
  },
  card: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E7E2DA",
    borderRadius: 18,
    padding: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111",
  },
  cardPrice: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: "700",
    color: BRAND,
  },
  addBtn: {
    backgroundColor: BRAND,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
});

