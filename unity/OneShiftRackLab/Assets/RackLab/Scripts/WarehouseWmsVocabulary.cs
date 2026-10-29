namespace OneShift.RackLab
{
    // Friendly descriptions sit beside stable scan identifiers. The ledger and
    // printed location barcode keep the same exact address.
    public static class WarehouseWmsVocabulary
    {
        public static string ItemCode(string sku)
        {
            switch (sku)
            {
                case "tape": return "TAPE-CLR";
                case "towels": return "TOWEL-BLU";
                case "gloves": return "GLOVE-L";
                case "mailers": return "MAILER-M";
                case "stretch": return "WRAP-CLR";
                case "labels": return "LABEL-4X6";
                case "wipes": return "WIPE-TUB";
                case "bags": return "BAG-PART";
                default: return sku ?? "";
            }
        }

        public static string BinName(string id)
        {
            switch (id)
            {
                case "REC-01": return "Parcel receiving / Front door";
                case "REC-02": return "Goods receiving / Loading door";
                case "STAGE-01": return "Ready to ship / Loading door";
                case "DISPATCH-01": return "Collection van";
            }
            if (string.IsNullOrEmpty(id)) return "No location";
            var parts = id.Split('-');
            if (parts.Length != 3 || parts[0].Length != 3 ||
                !int.TryParse(parts[0].Substring(1), out int bay) ||
                !int.TryParse(parts[1], out int level) ||
                !int.TryParse(parts[2], out int position)) return id;
            string side = position == 1 ? "Left" : "Right";
            return parts[0][0] == 'S' ? "Small shelf " + bay + " / Level " + level + " / " + side :
                "Row " + parts[0][0] + " / Bay " + bay + " / Level " + level + " / " + side;
        }
    }
}
