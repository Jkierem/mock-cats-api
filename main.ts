// deno-lint-ignore-file require-yield
import { CORS, Docs, Endpoint, Handler, Module, Server } from "@wogo/net";
import { Effect, Layer, Option } from "@effect";
import { pipe } from "@effect/Function";

type Cat = {
  category: string,
  name: string
}

class CatService extends Effect.Tag("Cats")<
  CatService,
  {
    get: (name: string) => Option.Option<Cat>
    getAll: (args: { limit?: number, offset?: number, category?: string }) => Effect.Effect<{
      cats: Cat[], 
      totalCount: number
    }>;
    create: (data: { name: string, category: string }) => Effect.Effect<void>;
  }
>(){
  static Live = Layer.effect(CatService, Effect.gen(function*(){
    const cats: Cat[] = [
      { name: "arthur", category: "calico" },
      { name: "byron", category: "calico" },
      { name: "conan", category: "calico" },
      { name: "dexter", category: "calico" },
      { name: "edgar", category: "calico" },
      { name: "felix", category: "calico" },
      { name: "garfield", category: "persian" },
      { name: "hercules", category: "persian" },
      { name: "ignacio", category: "parsian" },
      { name: "joker", category: "persian" },
    ];

    return CatService.of({
      get: (name) => Option.fromNullable(cats.find(c => c.name === name)),
      getAll: ({ limit, offset=0, category }) => {
        if( category ){
          const data = cats
            .filter(c => c.category === category)
          const slice = data
            .slice(offset, limit && offset + limit);
          return Effect.succeed({ cats: slice, totalCount: data.length });
        }
        const data = cats.slice(offset, limit && offset + limit)
        return Effect.succeed({ cats: data, totalCount: cats.length });
      },
      create(data){
        return Effect.sync(() => {
          cats.push(data);
        })
      }
    })
  }))
}

const CatEndpoint = pipe(
  Endpoint.gen.get("/:name", function*(result){
    const id = yield* Handler.PathParams.Get("name");
    const service = yield* CatService;

    return pipe(
      id,
      Option.flatMap(id => service.get(id)),
      Option.map((data) => result.respondWith(Response.json(data))),
      Option.getOrElse(() => result.respondWith(new Response("Not Found", { status: 404 })))
    )
  }),
  Docs.Endpoint.description("Get a single cat by name"),
  Docs.Endpoint.Parameter.path({
    name: "name",
    description: "Cat name"
  }),
  Docs.Endpoint.tag("Cats"),
)

const AddCatEndpoint = pipe(
  Endpoint.gen.post("", function*(result){
    const request = yield* Handler.Context.Proxy;
    const body = yield* request.json();

    yield* CatService.create(body);

    return result.respondWith(Response.json(body));
  }),
  Docs.Endpoint.description("Create a cat"),
  Docs.Endpoint.tag("Cats"),
)

const CatsEndpoint = pipe(
  Endpoint.gen.get("", function*(result){
    const limit = yield* Handler.QueryParams.GetNumber("limit", () => undefined);
    const offset = yield* Handler.QueryParams.GetNumber("offset", () => undefined);
    const category = yield* Handler.QueryParams.Get("category", () => undefined);

    const data = yield* CatService.getAll({ limit, offset, category });

    return result.respondWith(Response.json(data));
  }),
  Docs.Endpoint.description("Get all cats"),
  Docs.Endpoint.Parameter.query({
    name: "limit",
    description: "Page size"
  }),
  Docs.Endpoint.Parameter.query({
    name: "offset",
    description: "Page offset"
  }),
  Docs.Endpoint.Parameter.query({
    name: "category",
    description: "Filter by category"
  }),
  Docs.Endpoint.tag("Cats"),
)

const CatsModule = pipe(
  Module.make("/cats"),
  CORS.policy("*", { origin: "*", methods: ["get", "post"]}),
  Module.bind(AddCatEndpoint),
  Module.bind(CatEndpoint),
  Module.bind(CatsEndpoint)
)

const CatsServer = pipe(
  Server.make(),
  Server.bind(CatsModule),
  Docs.Server.swagger("/docs", {
    title: "Cats",
    description: "Cats as a service",
    version: Docs.OpenAPI.Version(1,0,0)
  }),
  Server.listen(4000),
  Effect.provide(CatService.Live)
)

Effect.runPromise(CatsServer);