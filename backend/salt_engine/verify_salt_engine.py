from salt_service import compare_prescription_medicines

sample_input = [
    {"brand_name": "Augmentin 625 Duo", "strength": "625mg"},
    {"brand_name": "Dolo 650", "strength": "500mg"},
    {"brand_name": "FakeBrandXYZ", "strength": "100mg"},
]

output = compare_prescription_medicines(sample_input)
assert output["items"][0]["status"] == "MATCHED"
assert output["items"][0]["savings_inr"] == 158.0
assert output["items"][1]["status"] == "NOT_IN_PMBJP_CATALOG"
assert output["items"][2]["status"] == "NOT_IN_PMBJP_CATALOG"
assert output["summary"]["total_savings_inr"] == 158.0

print("ALL SALT ENGINE CHECKS PASSED:")
print(output)
