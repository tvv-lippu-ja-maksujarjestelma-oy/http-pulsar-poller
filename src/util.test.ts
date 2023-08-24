import transformUnknownToError from "./util";

test("transformUnknownToError", () => {
  expect(transformUnknownToError(1)).toStrictEqual(new Error("1"));
  expect(transformUnknownToError("foo")).toStrictEqual(new Error("foo"));
  expect(transformUnknownToError(new Error("foo"))).toStrictEqual(
    new Error("foo"),
  );
});
